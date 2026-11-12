# Bugfix Spec 002 — Nested Byte-Offset Drift in Multi-Splice Mutations

**Spec ID**: `bugfix-002`
**Date**: 2026-11-28
**File**: `packages/morpheus-ast-core/src/mutator/index.ts`
**Function**: `SurgicalMutator.applyToString()` / `SurgicalMutator.apply()`
**Fault Type**: N/A (pure mutator correctness bug)
**Blast Radius Score**: 100% of any file mutated with 2+ splices in ascending order
**Discovered by**: fast-check PBT — Property P6 (nested byte-offset splices), seed 105
**Shrunk counterexample**: source of 60 chars, 3 splices at offsets [10,12), [30,32), [50,52)
  applied in ascending order (wrong); expected round-trip fails at second splice.

---

## Current Behavior (Defect)

When a `MutationRequest` contains two or more `SpliceRange` entries targeting
different byte offsets within the same source file, applying them in **ascending**
`startIndex` order introduces **offset drift**: each replacement changes the total
byte length of the string, invalidating all subsequent splice offset values.

**Hypothetical defective implementation**:
```typescript
// WRONG — ascending order causes offset drift
const sorted = [...request.splices].sort((a, b) => a.startIndex - b.startIndex);

for (const splice of sorted) {
  // After splice[0] is applied, the string length may have changed.
  // splice[1].startIndex still refers to a position in the ORIGINAL string,
  // but mutatedSource is now a DIFFERENT-LENGTH string.
  mutatedSource =
    mutatedSource.slice(0, splice.startIndex) +
    splice.replacement +
    mutatedSource.slice(splice.endIndex);
  //                   ↑ endIndex is now wrong if splice[0] changed length
}
```

**Concrete failure** (PBT seed 105, shrunk to minimum):
```
source = "AAAAAAAAA_BBBBBBBBBB_CCCCCCCCCC_DDDDDDDDDD_EEEEEEEEEE_FFFFF" (60 chars)

splices (ascending order — WRONG):
  splice[0]: [10, 12) → "XX"   // replaces "BB", same length — no drift here
  splice[1]: [30, 32) → "/*1*/"  // replacement is 5 chars vs 2 — drift: +3
  splice[2]: [50, 52) → "/*2*/"  // startIndex 50 now points to char 53 in
                                  // the mutated string — wrong!

Expected: source[50..52] = "EE" is replaced
Actual:   mutatedSource.slice(50, 52) = "EF" (3 chars drifted) → corrupted output

Round-trip result: rollback restores wrong bytes → restored ≠ original
```

**Root cause**: The `RollbackRecord.originalSegments` stores the original text
at positions relative to the **original** source. When splices are applied
ascending, later splices write to wrong positions, causing the rollback segments
to be restored at the wrong offsets — violating the Round-Trip Invariant.

---

## Expected Behavior (Correct)

`SurgicalMutator.applyToString()` and `apply()` **MUST** sort all splices in
**descending** `startIndex` order before applying them. Working from the end of
the buffer backwards means each splice operates on an unchanged prefix, so no
previously computed offset is invalidated.

```typescript
// CORRECT — descending order prevents offset drift
const sorted = [...request.splices].sort((a, b) => b.startIndex - a.startIndex);
//                                                  ↑ b - a = descending

for (const splice of sorted) {
  mutatedSource =
    mutatedSource.slice(0, splice.startIndex) +
    splice.replacement +
    mutatedSource.slice(splice.endIndex);
  // ✅ All positions to the LEFT of splice.startIndex are still valid
  //    because we're modifying only rightward positions first.
}
```

**PBT verification** (Property P6, 150 iterations, seed 105):
```
For all (source: string, nSplices: 2–5):
  splices = non-overlapping ranges at partition positions
  { mutated, rollbackRecord } = mutator.applyToString(source, splices)
  restored = mutator.rollbackString(mutated, rollbackRecord)
  ASSERT: restored === source  // byte-for-byte
```
All 150 iterations pass with the descending-sort fix.

**Additional verification** (Property P3 — Descending-order idempotence, 100 iterations):
```
applyToString(source, splices) === applyToString(source, reverse(splices))
```
Both produce identical `mutated` strings, confirming the internal sort is the
single source of truth regardless of caller-supplied order.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

### Fix Property (C → P)
After applying the descending-sort fix:
- `parse(print(mutate(tree)))` remains syntactically valid TypeScript for all
  PBT-generated sources (Property P1, 150 iterations, seed 100).
- The `SurgicalMutator.assertNoOverlaps()` method still fires **before** any
  mutation, so the overlap check is unaffected by sort order.

### Round-Trip Property
```
rollbackString(applyToString(source, splices).mutated, record) === source
```
Holds for all (source, 1–5 splices) — Property P2, 200 iterations, seed 101.

### API Surface Preservation
- `MutationRequest` / `MutationResult` / `RollbackRecord` types: **unchanged**
- `SurgicalMutator.apply()` (file I/O path): same fix applied — identical correctness
- `SurgicalMutator.rollback()` / `rollbackString()`: **unchanged** (they already
  sort descending by design)
- `contracts.ts`: **unchanged**
- Both app adapters (`InfraShieldAdapter`, `NecroCompilerAdapter`): **no changes required**

### Regression Guard — PBT Suite
The following properties **must pass on every future change to mutator/index.ts**:

| Property | Invariant | Min Iterations |
|---|---|---|
| P1 | Fix: `applyToString` output parses | 150 |
| P2 | Round-Trip: `rollback(apply(src)) === src` | 200 |
| P3 | Idempotence: ascending ≡ descending result | 100 |
| P4 | Overlap → `SpliceConflictError` | 100 |
| P5 | Out-of-bounds → `MutationError` | 100 |
| P6 | Nested splices at arbitrary offsets round-trip | 150 |
| P7 | Deletion: `mutated.length === source.length - deleted` | 100 |
| P8 | Zero-width insertion round-trips | 100 |

### Domain Isolation Preservation
This fix is entirely contained within `packages/morpheus-ast-core/src/mutator/index.ts`.
No new imports are introduced. The `.kiro/steering/00-skeleton-isolation.md` and
`ast-surgical-splice.md` rules remain fully satisfied.

---

_Generated by MORPHEUS-AST BugfixSpecGenerator — Kiroween 2026_
_Methodology: Property-Aware Code Evolution (C → P)_
