# Bugfix Spec 003: Splice Boundary Inside a Surrogate Pair Corrupts the File

**Spec ID**: `bugfix-003`
**File**: `packages/morpheus-ast-core/src/mutator/index.ts`
**Function**: `prepareBatch()` (used by `SurgicalMutator.apply()` and `applyToString()`)
**Discovered by**: fast-check PBT, property S4 in `tests/pbt/stress.pbt.test.ts`, seed `1058610110`, 2000 runs, shrunk 39 times
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

Splice offsets are UTF-16 code-unit indexes. The validator only checked
`0 <= startIndex <= endIndex <= source.length`. A boundary that falls between the
high and low half of a surrogate pair (any character above U+FFFF, such as an emoji)
was accepted. The in-memory string then contains a lone surrogate. `apply()` writes it
with `writeFile(..., "utf-8")`, which replaces a lone surrogate with U+FFFD. The
original character is destroyed on disk, and `rollback()` cannot restore it because the
information is no longer in the file.

**Observed counterexample** (shrunk by fast-check):

```
source:  a short string containing astral characters
splices: [{ startIndex: 0, endIndex: 5, replacement: "" }]   // end boundary inside a pair
file-backed apply():  Expected "n++ "   Received "n++ "   (printed identically, strings differ)
```

The two strings print the same but compare unequal, which is consistent with a U+FFFD
substitution. Violated property: **Round-Trip** `rollback(mutate(tree)) === tree`
for the file-backed path. The in-memory path (`applyToString`) was unaffected, which is why
the earlier in-memory suites did not catch it.

---

## Expected Behavior (Correct)

`prepareBatch()` rejects any splice whose `startIndex` or `endIndex` lies between a
high surrogate (U+D800 to U+DBFF) and a following low surrogate (U+DC00 to U+DFFF),
throwing `MutationError` before any text or file is changed:

```typescript
function splitsSurrogatePair(source: string, index: number): boolean {
  if (index <= 0 || index >= source.length) return false;
  const before = source.charCodeAt(index - 1);
  const after = source.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}
```

Splices on code-point boundaries, including replacing a whole astral character, behave as before.

Verification after the fix (2000 runs each):
- S4: file-backed apply and rollback restore the file byte-for-byte for arbitrary Unicode sources.
- S7: boundaries inside a pair are rejected with `MutationError("... surrogate pair ...")`, and the file content is unchanged afterwards.
- S8: replacing a whole astral character round-trips through the file.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- Splices on valid code-point boundaries produce the same output as before (S1, oracle comparison).
- Order independence (S3), overlap detection (`SpliceConflictError`), out-of-bounds detection
  (`MutationError`) and the rollback-length fix from `bugfix-002` are unchanged.
- ASCII and BMP-only sources are never rejected, because the guard only fires between a
  high and a low surrogate.
- No change to `contracts.ts`, to either adapter, or to the import boundary.

| Property | Invariant |
|---|---|
| S1 | unambiguous batches equal the left-to-right oracle and round-trip |
| S3 | result independent of supplied splice order |
| S4 | file-backed round-trip is byte-exact for arbitrary Unicode |
| S7 | boundary inside a surrogate pair throws and leaves the file unchanged |
| S8 | whole-astral-character replacement round-trips |
