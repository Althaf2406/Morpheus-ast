# Requirements Document

## Introduction

This feature adds deterministic remediation planning to the headless core engine. Given a SecurityScanResult and the source text of the file it refers to, the core returns a MutationRequest of surgical splices that removes the defect, or null when no safe fix exists. No AI service is involved. The NECRO game adapter uses these requests to give entities a real spell instead of `suggestedSpell: null`, and the HUD replaces its "no spell" message with lore text.

Supported finding categories are UNUSED_VARIABLE and UNCAUGHT_EXCEPTION. Plans use only the existing SpliceRange, MutationRequest, RollbackRecord and Mutator contracts. Existing contracts and behavior stay unchanged.

Constraints that apply to every requirement:
- Core code and core tests under `packages/morpheus-ast-core/` contain none of the words spell, monster, dungeon, lambda, chaos, serverless or SRE.
- Core code imports nothing from `apps/` and adds no UI dependency.
- No `any` type is used anywhere.
- Changes are not committed.

## Glossary

- **Remediation_Planner**: The module at `packages/morpheus-ast-core/src/remediation/` that implements `planRemediation`.
- **planRemediation**: A pure function `(finding: SecurityScanResult, sourceText: string, options?: RemediationOptions) => MutationRequest | null`, also exposed as `MorpheusASTEngine.planRemediation`.
- **RemediationOptions**: The optional third argument of `planRemediation`, shaped `{ errorCause: boolean }`. The caller sets `errorCause` to state whether the target runtime accepts the `cause` option on Error. When the argument or the `errorCause` field is omitted, `errorCause` is false.
- **Finding**: A SecurityScanResult as defined in `packages/morpheus-ast-core/src/contracts.ts`, identified by its `category`, `functionId` and `range`.
- **Synthetic_Finding**: A SecurityScanResult with category UNUSED_VARIABLE built by the NECRO_Adapter for a Direct_Zombie so that `planRemediation` can be called.
- **Direct_Zombie**: A zombie entity created from a name in `fn.unusedVariables` for which no UNUSED_VARIABLE Finding matches.
- **Topology_Analyzer**: The analyzer in `packages/morpheus-ast-core/src/topology/index.ts`, including `hasUncaughtExceptionPath`, which sets `hasUncaughtException`.
- **Catch_Form**: The try/catch wrapper text that Remediation_Planner inserts so that Topology_Analyzer stops reporting `hasUncaughtException` for the function. It has two variants selected by `errorCause`: Cause_Form and Plain_Form.
- **Cause_Form**: The Catch_Form used when `errorCause` is true. Its catch clause is `catch (<id>) { throw new Error("<functionName> failed", { cause: <id> }); }`.
- **Plain_Form**: The Catch_Form used when `errorCause` is false. Its catch clause is ``catch (<id>) { throw new Error(`<functionName> failed: ${String(<id>)}`); }``, which keeps the original error message in the new message and omits the `cause` option.
- **Side_Effect_Initializer**: A variable initializer that contains a call, `new`, `await`, assignment or update expression.
- **Mutator**: The surgical splice mechanism in `packages/morpheus-ast-core/src/mutator/`.
- **NECRO_Adapter**: `apps/necro-compiler-game/src/adapter.ts`.
- **Entity**: A game entity produced by NECRO_Adapter, one per defect.
- **Spell**: The `suggestedSpell` value on an Entity, holding the splices of a MutationRequest returned by `planRemediation`.
- **analyzedSources**: The map of file path to source text that NECRO_Adapter holds when `buildDungeonLayout` runs.
- **MonsterCard**: The HUD component `apps/necro-compiler-game/src/hud/MonsterCard.tsx`.
- **Integration_Test**: `apps/necro-compiler-game/src/engine/__tests__/realEngine.integration.test.ts`.
- **Round_Trip**: Applying a MutationRequest with Mutator, then rolling back with its RollbackRecord, yields source text byte-identical to the original.
- **Sample_Repo**: The sample repository used by existing tests and demos of this workspace.

## Requirements

### Requirement 1: Remediation planner API

**User Story:** As an engine consumer, I want a deterministic planner that turns a finding and its source text into splices, so that fixes are available without an AI service.

#### Acceptance Criteria

1. THE Remediation_Planner SHALL implement `planRemediation` as a pure function that takes a SecurityScanResult, a source text string and an optional RemediationOptions, and returns a MutationRequest or null.
2. THE MorpheusASTEngine interface in `contracts.ts` SHALL declare `planRemediation(finding, sourceText, options?)` as an additive member with the optional third parameter `options?: RemediationOptions`, and `createEngine()` in `packages/morpheus-ast-core/src/index.ts` SHALL provide it.
3. THE Remediation_Planner SHALL compute every splice range from the AST produced by the TypeScript Compiler API already used by the parser.
4. THE Remediation_Planner SHALL express every MutationRequest solely as SpliceRange items that satisfy the existing `contracts.ts` definition.
5. WHEN `planRemediation` is called twice with equal inputs, THE Remediation_Planner SHALL return deeply equal results.
6. IF the Finding category is neither UNUSED_VARIABLE nor UNCAUGHT_EXCEPTION, THEN THE Remediation_Planner SHALL return null.
7. IF the target node of the Finding cannot be located in the source text, THEN THE Remediation_Planner SHALL return null.
8. THE Remediation_Planner SHALL hold no mutable state shared across calls.
9. THE Remediation_Planner SHALL access no file system, no environment variable and no global state, so that `planRemediation` runs unchanged in a browser.
10. WHEN `planRemediation` is called without the `options` argument or without the `errorCause` field, THE Remediation_Planner SHALL treat `errorCause` as false.
11. WHEN `planRemediation` is called with two arguments, THE Remediation_Planner SHALL return the same result as a call with `{ errorCause: false }` as the third argument.

### Requirement 2: Unused variable remediation

**User Story:** As a developer, I want an unused variable removed cleanly, so that the finding disappears without breaking the code or dropping side effects.

#### Acceptance Criteria

1. WHEN `planRemediation` receives an UNUSED_VARIABLE Finding for a declared variable whose initializer has no side effects, THE Remediation_Planner SHALL return a MutationRequest whose splices delete the declaration of that variable.
2. WHEN the initializer of the unused variable is a Side_Effect_Initializer, THE Remediation_Planner SHALL return a MutationRequest that replaces the declaration with the initializer expression as an expression statement.
3. WHEN the declaration statement declares several variables, THE Remediation_Planner SHALL change only the declarator of the unused variable and keep the remaining declarators valid.
4. WHEN a MutationRequest for UNUSED_VARIABLE is applied, THE Topology_Analyzer SHALL no longer report that variable in `unusedVariables` for that function.
5. IF the variable name is not declared inside the target function, THEN THE Remediation_Planner SHALL return null.
6. THE Remediation_Planner SHALL change no characters outside the declaration range, other than the whitespace and line break that belong to a removed statement.

### Requirement 3: Uncaught exception remediation

**User Story:** As a developer, I want a function with an unhandled exception path to rethrow errors with context, so that errors are explicitly handled, never swallowed, and the analyzer stops flagging the function.

#### Acceptance Criteria

1. WHEN `planRemediation` receives an UNCAUGHT_EXCEPTION Finding and `errorCause` is true, THE Remediation_Planner SHALL wrap the function body in the Cause_Form `catch (<id>) { throw new Error("<functionName> failed", { cause: <id> }); }`, where `<id>` is an identifier that does not collide with any name declared in the function and `<functionName>` is the name of the function.
2. WHEN `planRemediation` receives an UNCAUGHT_EXCEPTION Finding and `errorCause` is false, THE Remediation_Planner SHALL wrap the function body in the Plain_Form ``catch (<id>) { throw new Error(`<functionName> failed: ${String(<id>)}`); }``, with `<id>` and `<functionName>` as in criterion 1.
3. THE Remediation_Planner SHALL emit no fallback return value in any Catch_Form, for functions that return no value, return a value, or are async.
4. WHEN a Catch_Form is applied, THE Topology_Analyzer SHALL report `hasUncaughtException` as false for that function, because `hasUncaughtExceptionPath` does not count a throw inside a catch clause as an uncovered throw.
5. WHEN the original function throws and the Cause_Form is applied, THE remediated function SHALL throw to its caller an error with the message `<functionName> failed` and with the original error as its `cause`.
6. WHEN the original function throws and the Plain_Form is applied, THE remediated function SHALL throw to its caller an error whose message is `<functionName> failed: ` followed by the string conversion of the original error, and the thrown error SHALL have no `cause`.
7. WHEN the function is async, THE Remediation_Planner SHALL keep the wrapped body inside the same async function, so that the returned promise rejects with the contextual error.
8. THE Remediation_Planner SHALL use exactly two insertion splices for an UNCAUGHT_EXCEPTION plan in either form, one before and one after the original body statements, so that the original body text remains unchanged.
9. THE design document SHALL record the Cause_Form, the Plain_Form, the `errorCause` option and its default, and the analyzer behavior that both forms rely on.

### Requirement 4: Mutation contract compliance

**User Story:** As a maintainer, I want every plan to obey the splice rules, so that mutations stay reversible and safe.

#### Acceptance Criteria

1. WHEN a MutationRequest returned by `planRemediation` is applied through Mutator, THE Mutator SHALL accept the request without raising SpliceConflictError.
2. THE Remediation_Planner SHALL produce splices that do not overlap and lie within the bounds of the source text.
3. THE Remediation_Planner SHALL produce no more than one splice per line range within a single MutationRequest, except for the two insertion splices of Requirement 3.
4. WHEN a MutationRequest is applied and then rolled back, THE Mutator SHALL produce source text byte-identical to the original (Round_Trip).
5. WHEN a MutationRequest is applied, THE Mutator SHALL produce source text that parses with zero syntax errors.
6. WHEN the Remediation_Planner creates a parsed tree, THE Remediation_Planner SHALL release it in a `finally` block before the function returns or throws.
7. THE Remediation_Planner SHALL build splice replacement text without applying `String.prototype.replace`, `split` or `join` to source text, and without regular expressions that locate ranges.

### Requirement 5: Core property-based tests

**User Story:** As a maintainer, I want property-based tests for the planner, so that invariants hold on generated inputs.

#### Acceptance Criteria

1. THE test suite SHALL include fast-check tests under `packages/morpheus-ast-core/tests/pbt/`, following the existing pattern of that directory, that run with jest.
2. THE test suite SHALL verify that, for every non-null result of `planRemediation`, the splices do not overlap and stay within the bounds of the source text.
3. THE test suite SHALL verify that applying a non-null result and then rolling back yields source text byte-identical to the original.
4. THE test suite SHALL verify that the source text after applying a non-null result parses with zero syntax errors.
5. THE test suite SHALL verify that, after applying a non-null result and re-analyzing the source, no finding with the same category and the same function appears.
6. THE test suite SHALL verify that `planRemediation` returns deeply equal results for equal inputs.
7. THE test suite SHALL draw inputs from two generators: synthetic source text produced by fast-check, and files from the Sample_Repo.
8. THE test suite SHALL verify that the `errorCause` option determines the Catch_Form: for every UNCAUGHT_EXCEPTION plan, `errorCause: true` yields the Cause_Form and `errorCause: false`, an omitted option or an omitted third argument yields the Plain_Form.
9. THE test suite SHALL verify that equal inputs combined with an equal `errorCause` value yield deeply equal results.
10. THE test suite SHALL verify, for every UNCAUGHT_EXCEPTION plan and for both values of `errorCause`, that when the original function throws, the remediated function still throws to the caller, and that the thrown error has a `cause` equal to the original error only when `errorCause` is true.
11. THE test suite SHALL verify that, for both values of `errorCause`, `planRemediation` performs no file system access.
12. THE core source files and test files SHALL contain none of the words spell, monster, dungeon, lambda, chaos, serverless or SRE.

### Requirement 6: NECRO adapter spells

**User Story:** As a player, I want entities to carry a real spell when a fix exists, so that casting it removes the entity.

#### Acceptance Criteria

1. WHEN `buildDungeonLayout` builds an Entity from a Finding, THE NECRO_Adapter SHALL call `planRemediation` with that Finding, the source text from analyzedSources and the options `{ errorCause: true }`, and SHALL set `suggestedSpell` to the splices of the returned MutationRequest.
2. WHEN `planRemediation` returns null for an Entity, THE NECRO_Adapter SHALL set `suggestedSpell` to null.
3. WHEN `fn.unusedVariables` contains a name that matches an UNUSED_VARIABLE Finding for the same function, THE NECRO_Adapter SHALL create one Entity for that variable and SHALL NOT create a separate Direct_Zombie.
4. IF `fn.unusedVariables` contains a name with no matching UNUSED_VARIABLE Finding, THEN THE NECRO_Adapter SHALL create a Direct_Zombie.
5. WHEN a Direct_Zombie is created, THE NECRO_Adapter SHALL call `planRemediation` with a Synthetic_Finding, the source text from analyzedSources and the options `{ errorCause: true }`, and SHALL set `suggestedSpell` from the result, or to null when the result is null.
6. THE NECRO_Adapter SHALL keep the existing contract types and the existing behavior for Entities whose defect category has no plan.
7. THE NECRO_Adapter SHALL import the core engine only as allowed by the boundary rules (`contracts`, and `src/index` in `adapter.ts` only).
8. THE design document SHALL explain the merge rule and the Direct_Zombie rule.

### Requirement 7: HUD lore text

**User Story:** As a player, I want in-world text when no spell exists, so that the message fits the game.

#### Acceptance Criteria

1. WHEN an Entity has `suggestedSpell` equal to null, THE MonsterCard SHALL display lore text stating that the monster is immune to ordinary spells and needs a Holy Incantation, described as a future feature.
2. THE MonsterCard SHALL no longer display the text "No spell is available".
3. THE MonsterCard source file SHALL contain at most 150 lines.
4. WHEN an Entity has a non-null `suggestedSpell`, THE MonsterCard SHALL keep its existing cast behavior unchanged.

### Requirement 8: Real-engine integration test

**User Story:** As a maintainer, I want an end-to-end test of a real spell, so that casting and undo are proven against the real engine.

#### Acceptance Criteria

1. THE Integration_Test SHALL include a case that analyzes real source, selects an Entity from the resulting layout whose `suggestedSpell` is non-null, and casts that spell without constructing splices by hand.
2. WHEN the spell is cast, THE Integration_Test SHALL assert that the Entity is absent from the re-analyzed layout.
3. WHEN the cast is undone, THE Integration_Test SHALL assert that the Entity is present again in the layout and that the source text is byte-identical to the original.
4. THE Integration_Test SHALL cover at least one UNUSED_VARIABLE case and one UNCAUGHT_EXCEPTION case.

### Requirement 9: Backward compatibility and boundaries

**User Story:** As a maintainer, I want existing behavior and architecture rules preserved, so that nothing else regresses.

#### Acceptance Criteria

1. THE Remediation_Planner SHALL leave existing exported types in `contracts.ts` unchanged and SHALL add new members only as additions.
2. THE Remediation_Planner SHALL leave results of existing engine methods unchanged for all existing tests.
3. THE core package SHALL add no dependency on React, Three.js, Vue or any other UI framework.
4. IF a file under `packages/morpheus-ast-core/` imports a path under `apps/`, THEN `pnpm run lint:boundaries` SHALL report a violation.
5. THE work SHALL leave all changes uncommitted in the working tree.

### Requirement 10: Final verification and report

**User Story:** As a maintainer, I want a fixed verification run and a coverage report, so that I can trust the change.

#### Acceptance Criteria

1. WHEN verification runs, THE command `pnpm --filter morpheus-ast-core test` SHALL complete with zero failures.
2. WHEN verification runs, THE NECRO app typecheck, test and build commands SHALL complete with zero errors and zero failures.
3. WHEN verification runs, THE InfraShield typecheck and test commands SHALL complete with zero errors and zero failures.
4. WHEN verification runs, THE command `pnpm run lint:boundaries` SHALL report zero violations.
5. WHEN verification completes, THE final report SHALL state which Catch_Form the NECRO_Adapter uses (the Cause_Form, because the adapter passes `errorCause: true`), and the count of Entities that have a non-null `suggestedSpell`, per defect type, for the Sample_Repo.
6. THE final report SHALL list each command run and its outcome.
