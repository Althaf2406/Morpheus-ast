# Bugfix Spec 002: Rollback Mis-locates Segments When Replacement Length Differs

**Spec ID**: `bugfix-002`
**File**: `packages/morpheus-ast-core/src/mutator/index.ts`
**Functions**: `SurgicalMutator.rollback()`, `SurgicalMutator.rollbackString()`
**Contract touched**: `RollbackRecord.originalSegments` in `src/contracts.ts`
**Discovered by**: fast-check PBT, properties P6 (seed 105), P7 (seed 106), P8 (seed 107) in `tests/pbt/mutator.pbt.test.ts`
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

`rollback` restored each segment with:

```typescript
restored =
  restored.slice(0, seg.startIndex) +
  seg.originalText +
  restored.slice(seg.startIndex + seg.originalText.length);
```

This removes `originalText.length` characters from the mutated text. The text that
needs removing is the *replacement*, whose length is only equal to
`originalText.length` for same-length splices. Any splice that grows, shrinks, deletes
or inserts leaves part of the replacement behind or removes neighbouring code.
For multiple splices the segment offsets were also taken in original coordinates and
applied to the mutated text without accounting for earlier length changes.

**Observed counterexamples** (fast-check, shrunk):

| Property | Seed | Input | Result |
|---|---|---|---|
| P7 deletion | 106 | source `function f0(x: number): number {…}`, delete 5 chars | restored `function f0(x: number): numberconst result = x * 1;…` (newline and indentation lost) |
| P8 insertion | 107 | same source, zero-width insert of `/* inserted:   */` | restored `con/* inserted:   */st result = x * 1;` (inserted text never removed) |
| P6 nested | 105 | same source, 2 splices replacing 2 chars with `/*0*/`, `/*1*/` | restored `nu0*/mber`, `resultx  /*1*/* 1` |

Violated property: **Round-Trip** `rollback(mutate(tree)) === tree`.

---

## Expected Behavior (Correct)

Each rollback segment records `replacementLength`. Rollback computes where each
segment sits in the mutated text and restores from the end backwards:

```typescript
// segments sorted ascending; mutatedStart = startIndex + sum(earlier replacementLength - originalText.length)
restored =
  restored.slice(0, mutatedStart) +
  seg.originalText +
  restored.slice(mutatedStart + seg.replacementLength);
```

`apply` and `applyToString` store `replacementLength: splice.replacement.length` for every
splice. The file-backed and in-memory paths share the same helpers (`prepareBatch`,
`applySorted`, `restoreSegments`), so they cannot diverge.

After the fix, P6, P7 and P8 pass, and so do the generative round-trip properties S1 and S4 in `stress.pbt.test.ts` (arbitrary Unicode sources and splice batches, 2000 runs each, in memory and on disk).

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- **Forward mutation output** is identical: splices are still validated, sorted descending by
  `startIndex`, and applied with `slice` concatenation. P3 (order independence) still passes.
- **Overlap detection**: overlapping ranges still throw `SpliceConflictError` before any change (P4).
- **Bounds checks**: out-of-range splices still throw `MutationError` (P5).
- **Same-length splices** still round-trip (P2).
- **Public API**: `MutationRequest`, `MutationResult` and the function signatures in `contracts.ts`
  are unchanged. `RollbackRecord.originalSegments` gained one required field,
  `replacementLength`. Both app adapters only pass `RollbackRecord` through, so no adapter change is needed.
- **Isolation**: no new imports; `lint:boundaries` still passes.

| Property | Invariant |
|---|---|
| P2 | `rollback(apply(src)) === src` for same-length splices |
| P3 | result independent of caller-supplied splice order |
| P4 | overlapping splices throw `SpliceConflictError` |
| P5 | out-of-bounds splice throws `MutationError` |
| P6 | nested multi-splice batches round-trip |
| P7 | deletion shrinks the source by the deleted length and round-trips |
| P8 | zero-width insertion round-trips |
