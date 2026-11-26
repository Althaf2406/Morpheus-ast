# Implementation Plan: Deterministic Remediation

## Overview

Language: TypeScript (strict, no `any`). The plan adds `planRemediation` to the core engine, then wires it into the NECRO adapter and HUD, then proves it end to end and runs the final verification. Core code and core tests under `packages/morpheus-ast-core/` must not contain the words spell, monster, dungeon, lambda, chaos, serverless or SRE. Nothing is committed.

UNCAUGHT_EXCEPTION plans wrap the whole original body in `try { ... } catch (<id>) { throw new Error(...); }`. The caller selects the catch form through the optional third parameter `RemediationOptions { errorCause: boolean }`, which defaults to false. With `errorCause: true` the planner emits the Cause_Form `throw new Error("<functionName> failed", { cause: <id> });`. With `errorCause: false`, an omitted `errorCause` field or an omitted third argument it emits the Plain_Form ``throw new Error(`<functionName> failed: ${String(<id>)}`);``. The planner reads no file system, no `tsconfig.json` and no environment, so it runs unchanged in a browser. No return-type classification or fallback value is derived. Every function with an uncovered call or throw gets a plan. The NECRO adapter passes `{ errorCause: true }` on both entity paths, so every spell in the game uses the Cause_Form.

All test sub-tasks are required, because Requirements 5 and 8 mandate the core and integration tests and the remaining test tasks cover Requirements 1 to 3, 6 and 7. No sub-task is optional.

## Tasks

- [x] 1. Core API surface and dispatcher
  - [x] 1.1 Add `RemediationOptions`, `PlanRemediation` type, engine member, dispatcher and planner stubs
    - In `packages/morpheus-ast-core/src/contracts.ts`, add `RemediationOptions { readonly errorCause: boolean }`, the `PlanRemediation` type `(finding, sourceText, options?: RemediationOptions) => MutationRequest | null`, and the additive `planRemediation` member on `MorpheusASTEngine`. Change no existing type.
    - Create `src/remediation/index.ts` with `planRemediation(finding, sourceText, options?)`: resolve `const errorCause = options?.errorCause ?? false`, return null for unsupported categories before parsing, parse with `ts.createSourceFile` (fresh and local per call), locate the enclosing function from `finding.range.startIndex` (fall back to `functionId`), return null if none, then dispatch by category, passing `errorCause` to the UNCAUGHT_EXCEPTION planner only. Keep no module-level mutable state and perform no file system, environment or global access.
    - Create `src/remediation/unusedVariable.ts` and `src/remediation/uncaughtException.ts` exporting `planUnusedVariableFix` and `planUncaughtExceptionFix` (which takes `errorCause: boolean`) with the final signatures, returning null for now.
    - Wire `planRemediation` (including the third parameter) into `createEngine()` in `src/index.ts`.
    - No regular expressions to locate ranges, and no `replace`, `split` or `join` on source text.
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 4.6, 4.7, 9.1, 9.3_

- [x] 2. Unused variable remediation
  - [x] 2.1 Implement `planUnusedVariableFix`
    - Locate the declarator inside the target function; return null if it is not declared there.
    - Implement `isSideEffectInitializer` (call, `new`, `await`, assignment, `++`/`--`) from the AST.
    - Single declarator: delete the statement (widen by one line break only), or replace it with `<initializer>;` when the initializer has side effects.
    - Several declarators: remove only the target declarator plus its adjoining comma. For a side-effect initializer, add one insertion of `<initializer>;` after the statement end.
    - All offsets come from `getStart(sourceFile)` and `getEnd()`. Splices must not overlap.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.2, 4.3, 4.7_

  - [x] 2.2 Write property tests for unused variable remediation
    - Create `packages/morpheus-ast-core/tests/pbt/remediation.pbt.test.ts` following the pattern of `mutator.pbt.test.ts` (fast-check, jest, at least 100 runs, tag `Feature: deterministic-remediation, Property N: <title>`).
    - **Property 5: Unused-variable removal eliminates the finding on re-analysis**
    - **Property 6: Unused-variable removal targets only the declared variable**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [x] 3. Uncaught exception remediation
  - [x] 3.1 Implement `planUncaughtExceptionFix` with both catch forms
    - In `src/remediation/uncaughtException.ts`, wrap the whole original body in `try { ... } catch (<id>) { ... }` using exactly two zero-width insertion splices: `"try {\n"` before the first body statement and the catch text after the last. The original body text stays unchanged.
    - Choose `<id>` as the first free name among `error`, `error2`, `error3`, ... that collides with no parameter, local, nested function or class name in the function.
    - When `errorCause` is true, emit the Cause_Form: `throw new Error("<functionName> failed", { cause: <id> });`.
    - When `errorCause` is false, emit the Plain_Form: ``throw new Error(`<functionName> failed: ${String(<id>)}`);``. Use `String(<id>)`, not `<id>.message`, because the caught value can be any type. Emit no `cause` option.
    - Use the topology analyzer's function name resolution, including its anonymous label.
    - Emit no `return`, no fallback value and no return-type classification, for void, value-returning and async functions alike. Keep the wrapper inside the same function so async signatures stay unchanged and rejection carries the contextual error. Do not use `Promise.resolve` or `Promise.reject`.
    - Do not create `causeSupport.ts`, and read no `tsconfig.json`, file or environment variable.
    - Return null only when the target function cannot be located or the body has no statements.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 1.9, 4.2, 4.3, 4.7_

  - [x] 3.2 Write property tests for uncaught exception remediation
    - Add to `tests/pbt/remediation.pbt.test.ts`.
    - For Property 7, generate functions with an uncovered call or throw and assert `{ errorCause: true }` yields the Cause_Form, while `{ errorCause: false }`, an options object without the `errorCause` field (typed with `Partial<RemediationOptions>` and a documented single cast, no `any`), and an omitted third argument all yield the Plain_Form with no `cause` option.
    - For Property 9, transpile the remediated source with `ts.transpileModule`, run it in `node:vm`, and call a function generated to throw (sync and async). For both values of `errorCause`, assert it still throws or rejects. With `errorCause: true`, assert the message equals `<functionName> failed` and `cause` equals the original thrown value. With `errorCause: false`, assert the message equals `<functionName> failed: ` plus `String(original)` and the error has no `cause`.
    - For Property 12, replace the `node:fs` read and write functions with throwing spies for the duration of the call, then assert `planRemediation` completes for both values of `errorCause`.
    - **Property 7: The `errorCause` option selects the Catch_Form**
    - **Property 8: Uncaught-exception wrapping eliminates the finding on re-analysis, in either form**
    - **Property 9: A throwing function still throws after remediation, with context, in either form**
    - **Property 10: Uncaught-exception plans use exactly two zero-width insertion splices, regardless of form**
    - **Property 11: Async functions stay wrapped in the same async function**
    - **Property 12: No file system access**
    - **Validates: Requirements 1.9, 1.10, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.5, 5.8, 5.10, 5.11**

- [x] 4. Cross-cutting core tests
  - [x] 4.1 Write contract-level property tests with both input generators
    - Add to `tests/pbt/remediation.pbt.test.ts`. Draw inputs from fast-check synthetic source generators and from Sample_Repo files (reuse how `sample-repo.test.ts` locates them). Obtain findings by running the engine analysis on the source.
    - **Property 1: Supported-category dispatch returns a shape, not a throw**
    - **Property 2: Unsupported categories always yield null**
    - **Property 3: Determinism** (draw `errorCause` from `true`, `false` and omitted, and compare two calls with equal inputs)
    - **Property 4: Unresolvable target yields null**
    - **Property 13: Splices are non-overlapping and in-bounds**
    - **Property 14: Round trip** (apply with the real Mutator, then roll back with its RollbackRecord)
    - **Property 15: Applied result always parses**
    - Run Properties 13 to 15 for both values of `errorCause`.
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.11, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.9**

  - [x] 4.2 Write unit tests for concrete examples
    - Create `packages/morpheus-ast-core/tests/pbt/remediation.unit.test.ts`.
    - Cover: void, value-returning, interface-typed-return and async functions all get the same rethrow structure with no `return`, in the Cause_Form with `{ errorCause: true }` and in the Plain_Form with `{ errorCause: false }`, an options object without the field and no third argument; the Plain_Form message keeps the `<functionName> failed: ` prefix and contains no `cause`; a two-argument call equals a call with `{ errorCause: false }`; `<id>` skips colliding names (`error`, `error2`); unknown variable name gives null; unsupported category gives null; out-of-range `range` gives null; side-effect initializer becomes an expression statement; first, middle and last declarator removal in a multi-declarator statement.
    - _Requirements: 1.6, 1.7, 1.10, 1.11, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.6, 3.7, 3.8_

- [x] 5. Checkpoint - Core package
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. NECRO adapter spells
  - [x] 6.1 Assign spells and merge zombies in `apps/necro-compiler-game/src/adapter.ts`
    - In `buildEntities`, set each finding entity's `suggestedSpell` from `planRemediation(finding, <analyzedSources text>, { errorCause: true })` (splices of the result, else null).
    - Compute names already covered by an `UNUSED_VARIABLE` finding for the function (read the identifier text at the finding range from `analyzedSources`). Skip those names in the `fn.unusedVariables` loop.
    - For uncovered names, build a Synthetic_Finding (`sourceScanner: "INTERNAL"`, category `UNUSED_VARIABLE`, range of the declaration located by AST) and set `suggestedSpell` from `planRemediation(synthetic, <analyzedSources text>, { errorCause: true })`, or null. Pass `{ errorCause: true }` on both entity paths, so every UNCAUGHT_EXCEPTION spell uses the Cause_Form.
    - Keep existing contract types and the behavior of entities with no plan. Import only `contracts`, plus `src/index` in `adapter.ts` as already allowed.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 6.2 Write property tests for adapter spell assignment and merge
    - Create `apps/necro-compiler-game/src/engine/__tests__/spellAssignment.pbt.test.ts` (vitest, fast-check if already a dependency of that app, otherwise table-driven cases).
    - Assert that the planner is called with `{ errorCause: true }` on both paths, by comparing each `suggestedSpell` with `planRemediation(finding, sourceText, { errorCause: true })` and checking that UNCAUGHT_EXCEPTION spells contain a `cause` option.
    - **Property 16: Adapter spell assignment mirrors the planner result**
    - **Property 17: Unused-variable entities are merged, not duplicated**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 7. HUD lore text
  - [x] 7.1 Replace the "no spell" message in `MonsterCard.tsx`
    - When `suggestedSpell` is null, show lore text saying the monster is immune to ordinary spells and needs a Holy Incantation, a future feature. Remove the text "No spell is available". Update any existing test or snapshot that asserts the old text.
    - Keep the file at 150 lines or fewer (extract text to `loreNames.ts` or a small sibling module if needed). Leave the cast behavior for non-null spells unchanged.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Write HUD tests
    - Under `apps/necro-compiler-game/src/hud/__tests__/`: null spell shows the lore text and not the old text; non-null spell keeps its cast control; `MonsterCard.tsx` has at most 150 lines.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Real-engine integration test
  - [x] 8.1 Add real spell cast and undo cases to `realEngine.integration.test.ts`
    - Analyze real source with the real engine and build the layout. Select an entity with a non-null `suggestedSpell` and cast it without hand-built splices.
    - Assert the entity is absent from the re-analyzed layout. Undo, then assert the entity is present again and the source is byte-identical to the original.
    - Cover at least one UNUSED_VARIABLE case and one UNCAUGHT_EXCEPTION case. For the UNCAUGHT_EXCEPTION case, also assert the cast source contains the Cause_Form (`{ cause: ... }`) and no `return` was added to the wrapper.
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9. Checkpoint - Application integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final verification
  - [x] 10.1 Add a spell coverage report test for the Sample_Repo
    - Create `apps/necro-compiler-game/src/engine/__tests__/spellCoverage.report.test.ts`. It builds the layout for the Sample_Repo with the real engine, counts entities with a non-null `suggestedSpell` per defect type (and the total per type for context), prints a table with `console.log`, and asserts the counts are internally consistent.
    - The same test inspects the replacement text of the UNCAUGHT_EXCEPTION spells and prints the Catch_Form in use. It asserts every UNCAUGHT_EXCEPTION spell is the Cause_Form (contains `cause:`), because the adapter passes `errorCause: true`.
    - _Requirements: 6.1, 10.5_

  - [x] 10.2 Core tests and source hygiene
    - Run `pnpm --filter morpheus-ast-core test` and confirm zero failures.
    - Search `packages/morpheus-ast-core/` (src and tests) for spell, monster, dungeon, lambda, chaos, serverless, SRE (case-insensitive) and for `: any`, `as any`, `<any>`. Confirm no new matches from this feature.
    - Search `src/remediation/` for `.replace(`, `.split(`, `.join(` and regex literals. Confirm none are applied to source text or used to locate ranges. Also search `src/remediation/` for `node:fs`, `fs`, `process.env` and `tsconfig` and confirm none.
    - _Requirements: 1.9, 4.7, 5.12, 9.2, 10.1_

  - [x] 10.3 NECRO typecheck, test and build
    - Run `pnpm --filter necro-compiler-game typecheck`, then `pnpm --filter necro-compiler-game test`, then `pnpm --filter necro-compiler-game build`. Confirm zero errors and zero failures.
    - _Requirements: 10.2_

  - [x] 10.4 InfraShield typecheck and test
    - Run `pnpm --filter infrashield-chaos typecheck` and `pnpm --filter infrashield-chaos test`. Confirm zero errors and zero failures.
    - _Requirements: 10.3_

  - [x] 10.5 Boundary lint
    - Run `pnpm run lint:boundaries` and confirm zero violations.
    - _Requirements: 9.3, 9.4, 10.4_

  - [x] 10.6 Report
    - Run `pnpm --filter necro-compiler-game exec vitest run src/engine/__tests__/spellCoverage.report.test.ts` and capture the table.
    - Final report: a statement of the Catch_Form the adapter uses (the Cause_Form, because the adapter passes `errorCause: true` on both entity paths), the per-type count of entities with a spell for the Sample_Repo, and each command run with its outcome. Confirm with `git status` that nothing was committed. Do not commit.
    - _Requirements: 9.5, 10.5, 10.6_

## Notes

- Every test sub-task is required: Requirements 5 and 8 mandate the core and integration tests, and tasks 4.2, 6.2 and 7.2 cover the unit, adapter and HUD behavior.
- Each task references specific requirements for traceability.
- No task commits changes.
- Command names assume package names `morpheus-ast-core`, `necro-compiler-game` and `infrashield-chaos`.
- Tasks 2.2, 3.2 and 4.1 all write `tests/pbt/remediation.pbt.test.ts`, so they sit in separate waves.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "4.2"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["5"] },
    { "id": 6, "tasks": ["6.1", "7.1"] },
    { "id": 7, "tasks": ["6.2", "7.2", "8.1"] },
    { "id": 8, "tasks": ["9"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3", "10.4", "10.5"] },
    { "id": 11, "tasks": ["10.6"] }
  ]
}
```
