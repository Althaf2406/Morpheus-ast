# Bugfix Spec 004: Bedrock Patch Suggestions Were Not Validated

**Spec ID**: `bugfix-004`
**File**: `packages/morpheus-ast-core/src/bedrock-advisor/index.ts`
**Functions**: `BedrockAdvisor.generatePatch()`, `validateSplices()` (replaced by `validate()` and `checkSplice()`)
**Discovered by**: `tests/pbt/bedrock-advisor.test.ts`, run with an injected stub client against the previous validator: **17 of 20 tests failed**
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

The model's reply is untrusted input, but it was converted into `SpliceRange` values with almost no checks.
The previous validator kept an item if it had `startIndex`, `endIndex` and `replacement` keys, then used
`typeof x === "number" ? x : 0` for offsets, trusted any `filePath` the model supplied, and passed the
**function id** as the default `filePath`.

The prompt asked for file-absolute "byte offsets" but showed the model only the function's text, so the model
could not know the correct offsets.

**Observed failures** (previous code, stub client):

| Test | Input | Result |
|---|---|---|
| B1 | valid splice | `filePath` was `"fn:a.ts:0:target"`, the function id, not the file path |
| B5 | one valid splice and one ending past the function | both returned, one with `endIndex` beyond the function |
| B7 | `startIndex: -1`; `startIndex: 1.5`; string offsets; start after end; `null` or numeric replacement | all returned as splices |
| B8 | splice carrying `filePath: "/etc/passwd"` | the model's path was used |
| B9 | overlapping splices | returned |
| B10 | boundary inside a surrogate pair | returned |
| B11 | no `confidence` in the reply | reported 0.5 |
| B12 | 21 splices | returned |
| B14 | target function missing from the graph; empty source | no error raised before calling the model |
| B15 | arbitrary JSON-ish splices (property test) | out-of-range, non-integer and unapplicable splices returned |

Violated property: **a returned suggestion can be applied by `SurgicalMutator`** (Fix property), and
**a suggestion never targets a file the engine did not choose**.

---

## Expected Behavior (Correct)

- The prompt asks for offsets **relative to the function source shown**, and states the valid range.
- The advisor maps them to file offsets with the function's `range.startIndex` from the graph, and sets
  `filePath` from the graph. A path in the reply is ignored.
- The **whole** patch is rejected (no splices, confidence 0, reason in the rationale) if any splice:
  is not an object; has non-integer or out-of-range offsets (`0 <= start <= end <= source length`);
  has a boundary inside a surrogate pair; has a non-string or over-long replacement; or if there are more
  than 20 splices, or any two overlap or share a start offset.
- Missing or non-numeric `confidence` is 0; otherwise it is clamped to 0 to 1.
- JSON wrapped in prose or code fences is still read.
- `generatePatch` throws `BedrockAdvisorError` before any call when the target function is not in the graph,
  the source text is empty, or its length does not match the function's range; and when the call itself fails.
- A client can be injected (`BedrockStreamClient`) so the advisor is testable without AWS.

After the fix all 21 advisor tests pass, including the property test **B15**: for arbitrary model output, a
returned patch is in bounds and `SurgicalMutator.applyToString` accepts it.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- `BedrockPatchSuggestion`, `BedrockPatchRequest` and the `generateBedrockPatch` signature in `contracts.ts` are unchanged.
- A well-formed reply still yields the same splices, now with correct file offsets and path (B1).
- A reply that is not JSON still yields no splices and confidence 0 instead of throwing (B3).
- A failing call still surfaces as `BedrockAdvisorError` (B13).
- A valid reply with an empty `splices` list is not an error.
- The AWS SDK is still loaded only on demand by `createEngine()`.
- Both adapters now send the real function source (see `bugfix-007`).

| Property | Invariant |
|---|---|
| B1 | offsets map to file offsets; path comes from the graph; result applies cleanly |
| B5, B7, B9, B10, B12 | any invalid splice rejects the whole patch |
| B8 | a model-supplied path is ignored |
| B15 | arbitrary output never yields an unapplicable patch |
