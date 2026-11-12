---
inclusion: always
---

# AST Surgical Splice & Mutation Governance (MORPHEUS-AST)

## 1. Core Principle

All code mutations produced by `packages/morpheus-ast-core/src/mutator/` **MUST** operate exclusively through **Surgical Line-Range AST Splice** — a precise, offset-aware replacement that targets a specific byte range `[startIndex, endIndex)` within the original source buffer without touching any characters outside that range.

## 2. Mandatory Mutation Contract

Every mutation operation **MUST** satisfy both of these invariants (verified by fast-check PBT):

### Fix Property (C → P)
```
parse(print(mutate(tree))) is syntactically valid
```
The output of any mutation, when printed and re-parsed, must yield a valid AST with zero syntax errors.

### Preservation / Round-Trip Property
```
rollback(mutate(tree)) === tree  (source-identical)
```
Applying a mutation followed by its rollback must produce a byte-for-byte identical result to the original source. No whitespace, comment, or formatting changes are permitted outside the targeted splice range.

## 3. Splice Operation Rules

- A splice is defined by a `SpliceRange` with `{ startIndex: number; endIndex: number; replacement: string }`.
- Splices within a single mutation batch **MUST** be applied in **descending** order of `startIndex` to avoid offset drift.
- Overlapping splice ranges within the same batch are **forbidden**; the mutator must throw a `SpliceConflictError` if detected.
- After applying splices, the mutator **MUST** store the original text segments as a `RollbackRecord` enabling full reversal.

## 4. Memory Management

- Every `Tree` object obtained from Tree-sitter parsing **MUST** be released with `tree.delete()` before the enclosing function returns or throws.
- Use `try/finally` blocks to guarantee cleanup even on error paths.
- Parser instances **MAY** be reused across calls but **MUST NOT** be shared across concurrent async operations without a mutex guard.

## 5. Forbidden Mutation Patterns (AI Agent Guard)

When generating mutation code, the AI agent **MUST NOT**:

- Use `String.prototype.replace()`, `String.prototype.split/join`, or template literals to modify source text outside of the final `replacement` string value inside a `SpliceRange`.
- Modify AST node properties directly (e.g., `node.text = "..."`) — Tree-sitter nodes are immutable.
- Reconstruct the entire source file from scratch rather than applying targeted splices.
- Skip the rollback record when performing any mutation, even "simple" single-token replacements.
- Mutate the same line range more than once in a single operation batch.
