# morpheus-ast-core

Headless, application-agnostic AST engine: parsing, a cross-file call topology, blast-radius
analysis, fault injection, and a surgical mutator with exact rollback. It has no UI, no domain
vocabulary, and does not import from `apps/`. Applications depend only on the types in
`src/contracts.ts`.

## Entry points

| Import | What it is |
|---|---|
| `morpheus-ast-core` | `createEngine()` returns a `MorpheusASTEngine` (see `contracts.ts`). Runs in Node and in a browser bundle. |
| `morpheus-ast-core/tree-sitter` | `TreeSitterParser`, the audited Tree-sitter WASM parser. Optional; not used by `createEngine()`. |

## Parsers

- **TypeScript Compiler API (default).** Used by `createEngine()`. Needs no assets, so a browser
  deployment does not have to host any `.wasm` file.
- **Tree-sitter WASM (optional).** Every tree is released with `tree.delete()` in a `finally` block.
  Offsets are UTF-16 indexes, the same unit the mutator uses. Audit: `tests/pbt/tree-sitter-wasm.test.ts`
  (0 MB WASM heap growth over 1000 parses with `delete()`, 83 MB over 300 without it).
  To use it in a browser, host a grammar such as `tree-sitter-typescript.wasm` (about 2 MB).

## Sample repository

`engine.getSampleRepository()` returns a three-file in-memory repository with known flaws (high
complexity, missing error handling, a call cycle). Parse it with `parseSourceFiles({ filePaths: [],
virtualFiles })` and mutate it with `applyMutationToText` / `rollbackMutationText`. No file system,
login, or upload is needed.

## Mutator guarantees

- Splices are applied in descending order; overlapping ranges throw `SpliceConflictError`.
- A boundary inside a UTF-16 surrogate pair throws `MutationError` (it would corrupt the file on write).
- `rollback(apply(source)) === source` for any valid batch, in memory and on disk.

## Scripts

```
pnpm run lint:boundaries   # import boundaries, no `any`, no application vocabulary in core
pnpm run test:pbt          # property tests; FC_RUNS=2000 for a heavy run
node scripts/scan-secrets.mjs
```
