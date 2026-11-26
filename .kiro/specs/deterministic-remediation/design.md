# Design Document

## Overview

`planRemediation` is a pure function added to the headless core engine:

```ts
planRemediation(
  finding: SecurityScanResult,
  sourceText: string,
  options?: RemediationOptions
): MutationRequest | null
```

It lives at `packages/morpheus-ast-core/src/remediation/index.ts` ("Remediation_Planner"), is wired into `createEngine()` in `src/index.ts`, and is declared as an additive member of `MorpheusASTEngine` in `src/contracts.ts`. It re-parses `sourceText` with the TypeScript Compiler API (the same parser the rest of the core uses), locates the AST node the finding's `range` points at, and returns a `MutationRequest` of `SpliceRange` items, or `null` when no safe, certain fix exists. It never mutates anything itself — the caller still goes through the existing `Mutator`.

Two finding categories are supported: `UNUSED_VARIABLE` and `UNCAUGHT_EXCEPTION`. Any other category returns `null` (Requirement 1.6).

The optional third parameter, `RemediationOptions`, carries a single field, `errorCause: boolean`, defaulting to `false` when the parameter or the field is omitted. It selects which of the two UNCAUGHT_EXCEPTION catch forms the planner emits (Cause_Form or Plain_Form, see part (a)). It has no effect on UNUSED_VARIABLE plans.

The module is entirely fs-free: it reads no file from disk, no environment variable, and no `tsconfig.json`. The only inputs to `planRemediation` are the two required arguments and the options object, all supplied by the caller in memory. This is a hard requirement, not an optimization, because `packages/morpheus-ast-core` runs inside the browser tab of both `apps/infrashield-chaos` and `apps/necro-compiler-game` — there is no Node.js file system available at runtime, and any attempt to resolve a project's `tsconfig.json` from disk would simply fail or hang in that environment. The caller (the game adapter) is the one place that knows, out of band, whether its target runtime wants structured `cause` chaining, and it states that choice directly via `errorCause: true`, rather than the planner trying to infer it from a configuration file it cannot read.

No identifier, comment, or string literal introduced by this feature uses the words spell, monster, dungeon, lambda, chaos, serverless, or SRE. The consuming game adapter keeps its own vocabulary; the core stays neutral.

## Architecture

```
SecurityScanResult + sourceText + options?: RemediationOptions
          │
          ▼
  ts.createSourceFile (fresh, local — no shared parser state)
          │
          ▼
  locate target node by finding.range.startIndex / functionId
          │
     ┌────┴────┐
     ▼         ▼
UNUSED_VARIABLE UNCAUGHT_EXCEPTION
 planner         planner (reads options.errorCause)
     │         │
     ▼         ▼
 SpliceRange[] or null
          │
          ▼
    MutationRequest | null
```

`Remediation_Planner` holds no module-level mutable state. Each call creates its own `ts.SourceFile`, derives splices from it, and discards it. This satisfies Requirement 1.8 and makes repeated calls with equal inputs (including an equal `errorCause` value) deeply equal (Requirement 1.5, 1.9, 1.11), since the function is a total, referentially transparent map from `(finding, sourceText, options)` to output, with no I/O anywhere in that map.

### File layout

- `packages/morpheus-ast-core/src/remediation/index.ts` — `planRemediation`, dispatch, node location, `RemediationOptions` default handling.
- `packages/morpheus-ast-core/src/remediation/unusedVariable.ts` — Requirement 2 algorithm.
- `packages/morpheus-ast-core/src/remediation/uncaughtException.ts` — Requirement 3 algorithm, including both Catch_Form variants.
- `packages/morpheus-ast-core/tests/pbt/remediation.pbt.test.ts` — property tests (Requirement 5).

None of these files import from `apps/`; `contracts.ts` gains only additive members per Requirement 9.1. There is no `causeSupport.ts` module and no code path that reads a `tsconfig.json` — the form is selected purely from the caller-supplied `options.errorCause`.

## Components and Interfaces

### `contracts.ts` additions

```ts
export interface RemediationOptions {
  readonly errorCause: boolean;
}

export type PlanRemediation = (
  finding: SecurityScanResult,
  sourceText: string,
  options?: RemediationOptions
) => MutationRequest | null;
```

Added to `MorpheusASTEngine`:

```ts
export interface MorpheusASTEngine {
  // ...existing members unchanged...
  readonly planRemediation: PlanRemediation;
}
```

No existing member, field, or type is altered. `RemediationOptions` and `PlanRemediation` are both new, additive exports.

### `remediation/index.ts`

```ts
export function planRemediation(
  finding: SecurityScanResult,
  sourceText: string,
  options?: RemediationOptions
): MutationRequest | null {
  const errorCause = options?.errorCause ?? false;

  if (finding.category !== "UNUSED_VARIABLE" && finding.category !== "UNCAUGHT_EXCEPTION") {
    return null;
  }

  const sourceFile = ts.createSourceFile(
    finding.filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );

  try {
    const functionNode = findEnclosingFunction(sourceFile, finding);
    if (functionNode === null) return null;

    if (finding.category === "UNUSED_VARIABLE") {
      return planUnusedVariableFix(sourceFile, functionNode, finding);
    }
    return planUncaughtExceptionFix(sourceFile, functionNode, finding, errorCause);
  } finally {
    // ts.SourceFile is not a Tree-sitter Tree and carries no native handle,
    // but the module still follows the same discipline: no reference to
    // `sourceFile` escapes this function after this block.
  }
}
```

`findEnclosingFunction` walks the AST once, finds the function-like node whose text range contains `finding.range.startIndex` (falling back to `finding.functionId` match against the function's declared name when ranges are ambiguous), and returns `null` if nothing contains that offset — satisfying Requirement 1.7. This mirrors the lookup style already used by `findNodeById` in `topology/index.ts`.

Per rule AST-SURGICAL-SPLICE, all source text manipulation happens exclusively as `replacement` strings inside `SpliceRange` objects; the planner never calls `String.prototype.replace`, `split`, or `join` on `sourceText`, and never uses a regular expression to locate a range (Requirement 4.7). Every offset comes from `node.getStart(sourceFile)` / `node.getEnd()`.

## Purity and determinism

`planRemediation` is a pure function of its three arguments:

- **No file system access.** The planner never calls `fs.readFileSync`, never resolves a `tsconfig.json`, and never walks a directory tree. Every byte it reads comes from the `sourceText` string argument.
- **No environment or global state.** It reads no environment variable, no process-wide cache, and no mutable module-level variable; each call builds and discards its own `ts.SourceFile`.
- **Caller-supplied configuration instead of inferred configuration.** The one piece of information that used to require reading a project's `tsconfig.json` — whether the target runtime accepts `Error`'s `cause` option — is now supplied directly by the caller as `options.errorCause`. This removes the only I/O-shaped step the planner used to need and keeps the function callable from a browser tab with no disk at all.
- **Deterministic output.** Because the only inputs are `finding`, `sourceText`, and `options`, and the function performs no I/O and holds no state, equal inputs (by deep equality, including an equal `errorCause`) always produce deeply equal outputs (Requirement 1.5, 1.11, 5.9), and two calls that differ only in `errorCause` select between exactly the two documented Catch_Form variants (Requirement 5.8).

## Data Models

No new persisted or exported data shapes are introduced beyond `RemediationOptions`. The feature reuses existing `contracts.ts` types without modification to their fields:

- **`SecurityScanResult`** (input) — consumed as-is; `category`, `functionId`, `range`, and `filePath` drive dispatch and node lookup. The adapter's Synthetic_Finding is a plain value of this same type, with `sourceScanner: "INTERNAL"` as its only distinguishing field value.
- **`RemediationOptions`** (new input, optional) — `{ errorCause: boolean }`. Not persisted; constructed fresh by the caller on each `planRemediation` call.
- **`SpliceRange`** (output element) — `{ filePath, startIndex, endIndex, replacement, description }`, produced exclusively via AST offsets as described below; never hand-built from string search.
- **`MutationRequest`** (output) — `{ splices: readonly SpliceRange[] }`, the sole return shape for a non-null result.
- **`PlanRemediation`** (new function type) — `(finding: SecurityScanResult, sourceText: string, options?: RemediationOptions) => MutationRequest | null`, added to `contracts.ts` and to `MorpheusASTEngine` as `planRemediation`.

## (a) UNCAUGHT_EXCEPTION: the two Catch_Form variants and why the analyzer accepts both

### What `hasUncaughtExceptionPath` actually checks

Reading `hasUncaughtExceptionPath` in `packages/morpheus-ast-core/src/topology/index.ts` (around line 350) line by line:

1. It walks the function body with an `inTry` flag, initially `false`.
2. On any `ts.TryStatement` it sets `hasTryCatch = true` (unconditionally — a bare `try { ... }` with no risky code still flips this flag), then recurses into the try block and the catch clause with `inTry = true`, and into the finally block with the *outer* `inTry` value.
3. A `ts.ThrowStatement` sets `hasUncoveredThrow = true` only if it is visited with `inTry = false`, i.e. a throw statement that is not textually inside a `TryStatement`'s try/catch region counts against the function; a throw **inside** a try or inside a catch clause does not.
4. After the walk: if `hasTryCatch` is `false`, the function falls back to "does it contain any call expression" — presence of a bare call with no `try` anywhere makes the function flagged regardless of whether that call throws. If `hasTryCatch` is `true`, the result is simply `hasUncoveredThrow` (the call-expression fallback is skipped entirely once any try/catch exists anywhere in the function).

Two consequences drive the fix shape, and both hold identically for either Catch_Form:

- **Wrapping the whole original body in one `try { ... } catch { ... }` is sufficient and necessary.** Because step 4 skips the call-fallback the moment `hasTryCatch` is true, and because every original statement will now be visited with `inTry = true`, any throw or call that was previously unguarded becomes guarded, and `hasUncoveredThrow` stays `false`. A narrower try (wrapping only one statement) would still flip `hasTryCatch`, but any *other* original statement left outside it that calls a function or throws would still be visited with `inTry = false` and re-trigger `hasUncoveredThrow` or the call fallback — so the splice must cover the entire original statement list, not a subset.
- **The catch clause itself must not introduce a new unguarded throw.** Both Catch_Forms rethrow (`catch (e) { throw new Error(...); }`), and that `throw` is visited by `visit(node.catchClause, true)` — i.e. with `inTry = true` — so it does *not* set `hasUncoveredThrow`, regardless of which form's message/options expression follows `throw new Error(`. Rethrowing inside the generated catch is therefore safe with respect to this analyzer precisely because the analyzer only counts a throw as uncovered when it is textually outside every try/catch region. This is also why the fix is semantically honest rather than a suppression trick: the function still throws to its caller (Requirement 3.4), it only throws a new, context-carrying error instead of letting the original propagate unannotated.

### The `errorCause` option

`cause` is the optional `ErrorOptions` field (`new Error(message, { cause })`) added to the `Error` constructor's type declarations by `lib.es2022.error.d.ts`. Whether the generated code may write `{ cause: <id> }` depends on whether the *target runtime* (wherever the remediated code actually executes) supports it — information the planner cannot discover on its own without reading that target's build configuration from disk, which it is not allowed to do (see "Purity and determinism" above). Rather than guessing or reading a `tsconfig.json`, `planRemediation` asks the caller to state this directly: `options.errorCause`, `true` or `false`, defaulting to `false`.

- **`errorCause: true` → Cause_Form.** The planner emits `{ cause: <id> }` in the generated `Error`, carrying the original thrown value through unchanged.
- **`errorCause: false` (or omitted, or `options` omitted entirely) → Plain_Form.** The planner emits no `cause` option. Instead it folds the original thrown value's string conversion directly into the new error's message, via a template literal: `` `<functionName> failed: ${String(<id>)}` ``. `String(<id>)` is used rather than `<id>.message` because the caught value is not guaranteed to be an `Error` instance (a function body may `throw` any value), and `String()` has defined behavior for every value, keeping the generated code total.

Both forms satisfy Requirement 3.3 (no fallback return value in either branch, for void, value-returning, or async functions) and Requirement 3.7 (the wrapper stays inside the same `async` function when the function is async, so the returned promise rejects with the contextual error).

### Cause_Form

```ts
try {
  <original body statements, byte-identical, unmoved>
} catch (<generatedErrorIdentifier>) {
  throw new Error("<functionName> failed", { cause: <generatedErrorIdentifier> });
}
```

### Plain_Form

```ts
try {
  <original body statements, byte-identical, unmoved>
} catch (<generatedErrorIdentifier>) {
  throw new Error(`<functionName> failed: ${String(<generatedErrorIdentifier>)}`);
}
```

In both forms, `<generatedErrorIdentifier>` is chosen by the planner to avoid colliding with any name declared anywhere inside the function (parameters, local `const`/`let`/`var`, and nested function/class names) — it tries `error`, then `error2`, `error3`, ... until the first one that is free (Requirement 3.1, 3.2). `<functionName>` is read from the same function-name resolution already used by the topology analyzer (falling back to the same anonymous-position label when the function has no name, in which case the message simply embeds that label text).

There is no return statement, no `return;`, and no fallback value in either branch of either Catch_Form: **the only outcome of entering the catch clause is a throw.** This holds uniformly for functions that return no value, functions that return a value, and `async` functions (Requirement 3.3) — the planner never inspects or classifies the function's return type, so there is no "no fallback can be derived with certainty → return null" case left in this algorithm. A non-null plan is produced for every function whose body contains at least one call expression or throw statement not already inside a try/catch, regardless of its declared or inferred return type, and regardless of `errorCause`.

For an **async** function, the same `try { ... } catch { ... }` wrapper is inserted *inside* the existing `async function`/arrow body; the function keyword, `async` modifier, and signature are never touched. Because the function is `async`, a `throw` inside its body (including inside this catch clause) causes the returned promise to reject with that thrown error — so the caller observes rejection with the contextual error exactly as a synchronous caller observes a thrown error, with no `Promise.resolve`/`Promise.reject` splice needed, in either form (Requirement 3.7).

### Splice shape (Requirement 3.8)

Exactly two insertion splices, both zero-width (`startIndex === endIndex`) so the original body text is never touched, never re-parsed into fragments, and never duplicated in a `RollbackRecord` segment other than as the two empty originals:

1. Splice A: at the start offset of the first body statement, `replacement = "try {\n"`.
2. Splice B: at the end offset of the last body statement, `replacement` is the Cause_Form's `"\n} catch (<id>) {\n  throw new Error(\"<functionName> failed\", { cause: <id> });\n}"` when `errorCause` is `true`, or the Plain_Form's `` "\n} catch (<id>) {\n  throw new Error(`<functionName> failed: ${String(<id>)}`);\n}" `` when `errorCause` is `false`.

Both splices carry the same `filePath`; their ranges never overlap (A's `endIndex` equals A's `startIndex`, strictly less than B's `startIndex`, which is at or after the end of the body). This satisfies the mutator's descending-order, non-overlap contract in `mutator/index.ts` without needing a third splice and without rewriting any original character — directly answering Requirement 4.2/4.3's "no more than one splice per line range, except the two insertion splices of Requirement 3."

## (b) Adapter merge rule: zombies vs findings, and the Direct_Zombie rule

This section lives in `apps/necro-compiler-game/src/adapter.ts`, specifically `buildEntities` (currently around line 299) and the loop at line 318 that iterates `fn.unusedVariables`.

**Current behavior (before this feature):** `buildEntities` creates one entity per `SecurityScanResult` in `findings`, each with `suggestedSpell: null`, and then *unconditionally* creates one additional entity per name in `fn.unusedVariables`, also with `suggestedSpell: null` — regardless of whether that name already has a matching `UNUSED_VARIABLE` finding. This means a single unused variable that a scanner already reported can produce two entities.

**New merge rule:**

1. Build the set of variable names already covered by an `UNUSED_VARIABLE` finding for this function: `const coveredNames = new Set(findings.filter(f => f.category === "UNUSED_VARIABLE" && f.functionId === fn.id).map(findingToVariableName))`. The name is recovered from the finding's `range` by reading the identifier text at that range from `analyzedSources`, since `SecurityScanResult` does not carry the variable name as a separate field.
2. For every `finding` in `findings` (covering all categories, not just unused-variable): build the entity exactly as before, but set `suggestedSpell` to the splices of `this.engine.planRemediation(finding, sourceText, { errorCause: true })`, or `null` when that call returns `null` (Requirement 6.1, 6.2).
3. For every name in `fn.unusedVariables`:
   - If the name is in `coveredNames`, **skip it** — the finding-driven entity from step 2 already represents this variable. No second entity is created (Requirement 6.3).
   - If the name is **not** in `coveredNames`, it is a **Direct_Zombie**: there is no formal `SecurityScanResult` for it (e.g. the scanner that produces `UNUSED_VARIABLE` findings missed it, or topology analysis is more sensitive than the scanner). The adapter builds a **Synthetic_Finding** for it and creates one entity from that (Requirement 6.4, 6.5).

The adapter always passes `{ errorCause: true }`, in both call sites above. The target runtime for `apps/necro-compiler-game` is modern enough to support `Error`'s `cause` option, and since the adapter — not the core — is the place that knows this, it states it explicitly rather than leaving the planner to guess. This is why every spell the game ever shows the player uses the Cause_Form, never the Plain_Form.

**Synthetic_Finding rule:** a Direct_Zombie needs a `SecurityScanResult` so the single `planRemediation(finding, sourceText, options)` call path can stay uniform across both origins of unused-variable entities. The adapter constructs:

```ts
const synthetic: SecurityScanResult = {
  findingId: `synthetic-unused-${fn.id}-${varName}`,
  severity: "LOW",
  category: "UNUSED_VARIABLE",
  title: `Unused variable: ${varName}`,
  description: `Variable "${varName}" is declared but never used.`,
  filePath: fn.filePath,
  range: declarationRangeOf(varName, fn, sourceText), // located via the same AST walk the planner itself uses
  functionId: fn.id,
  sourceScanner: "INTERNAL",
  cweId: null,
  cvssScore: null,
};
```

`sourceScanner: "INTERNAL"` marks it as adapter-synthesized rather than tool-reported, which keeps it visually/semantically distinguishable from scanner findings without needing a new contract field (Requirement 9.1 — no contract change). The same `planRemediation` call is then made with this synthetic finding and `{ errorCause: true }`, and `suggestedSpell` is set from its result or `null` (Requirement 6.5). All other entity fields (`entityId`, `type`, etc.) are built exactly as the current `ZOMBIE_VARIABLE` branch already does, so behavior for every other defect category is unchanged (Requirement 6.6).

```
buildEntities(fn, findings):
  coveredNames = names of UNUSED_VARIABLE findings for fn, read from source at each finding's range
  for finding in findings:
      entity = { ...as before..., suggestedSpell: splices(planRemediation(finding, source, { errorCause: true })) ?? null }
      emit entity
  for varName in fn.unusedVariables:
      if varName in coveredNames: continue        // merge rule — no duplicate entity
      synthetic = buildSyntheticFinding(fn, varName, source)
      entity = { ...Direct_Zombie fields..., suggestedSpell: splices(planRemediation(synthetic, source, { errorCause: true })) ?? null }
      emit entity
```

`buildEntities` keeps importing only `contracts` and the engine instance it already received through the constructor; no new import of `src/index` is introduced outside `adapter.ts`, preserving Requirement 6.7 and the Skeleton Crew boundary rules.

## (c) UNUSED_VARIABLE algorithm

Implemented in `remediation/unusedVariable.ts`, called from the dispatcher with the enclosing function node and the finding. `errorCause` has no bearing on this algorithm; it exists only for UNCAUGHT_EXCEPTION plans.

### Locating the declarator

1. From the function node, walk its body for `ts.VariableDeclaration` nodes whose name is an identifier matching the target variable name (recovered the same way as in the adapter: read the identifier text at `finding.range` from `sourceText`, or match by `functionId` + name when the finding already carries enough context).
2. If no such declaration exists inside the function, return `null` (Requirement 2.5).
3. Take the enclosing `ts.VariableDeclarationList` (`declarator.parent`) and its enclosing `ts.VariableStatement` (`declarationList.parent`) to determine whether this is the sole declarator or one of several (Requirement 2.3).

### Side-effect detection

`isSideEffectInitializer(initializer: ts.Expression): boolean` returns `true` when the initializer tree contains, at any depth, a `ts.CallExpression`, `ts.NewExpression`, `ts.AwaitExpression`, `ts.BinaryExpression` with an assignment operator, or `ts.PrefixUnaryExpression`/`ts.PostfixUnaryExpression` with `++`/`--`. This matches the Side_Effect_Initializer definition in the glossary and is computed purely from the AST, never from source text patterns.

### Splice construction (single declarator, i.e. `declarationList.declarations.length === 1`)

- **No side effect** (Requirement 2.1): one splice deletes the entire `ts.VariableStatement`, `[statement.getStart(sourceFile), statement.getEnd())`, replacement `""`. If the statement is followed by its own trailing newline that is *part of the statement's trivia* (leading/trailing whitespace already captured by `getFullStart()`/`getEnd()` semantics for the statement including its line terminator up to the next token's leading trivia), the splice range is widened by exactly one line-break character so the blank line left behind collapses — this is the only whitespace allowed to change outside the literal declaration text, matching Requirement 2.6.
- **Side effect present** (Requirement 2.2): one splice replaces `[statement.getStart(sourceFile), statement.getEnd())` with `"<initializer text>;"`, turning `const x = doThing();` into `doThing();`. The replacement text embeds only the initializer's own source slice (read once via `initializer.getText(sourceFile)`, which is a Tree-sitter/TS-API read of existing text, not a `.replace()` call) plus a literal semicolon — no regex, no string surgery beyond concatenation of the `replacement` field.

### Splice construction (multiple declarators, Requirement 2.3)

When `declarationList.declarations.length > 1`, only the target declarator is touched, and the rest of the statement is left completely intact:

- **No side effect**: one splice removes just that declarator and the one adjoining comma — `[start, end)` computed as:
  - if the target is not the last declarator: from the declarator's own start to the start of the *next* declarator (absorbing the trailing `, `),
  - if it is the last declarator: from the end of the *previous* declarator (absorbing the leading `, `) to the declarator's own end.
  - Replacement is `""` in both cases. This keeps `let a, b, c;`-style lists syntactically valid for any position of the removed name, satisfying the Fix Property (`parse(print(mutate(tree)))` stays valid) because the comma-list grammar only requires the remaining declarators to still be comma-separated.
- **Side effect present**: the declarator is removed from the list exactly as above, and a second splice inserts a new statement `"<initializer text>;"` immediately after the enclosing `ts.VariableStatement`'s end, so the side effect still runs in its original relative position without leaving an orphaned declarator. These two splices never overlap (the removal is strictly inside the statement; the insertion point is at or after the statement's end) and are ordered by the mutator's own descending-`startIndex` application.

### Why this keeps `hasUncaughtExceptionPath`/topology correct

Removing or rewriting only the declarator leaves every other statement's offsets within the function textually unchanged outside the spliced range, so re-running `detectUnusedVariables` (`topology/index.ts`, around line 212) on the mutated source no longer finds the removed name in `declared`, satisfying Requirement 2.4, while the `used` set computation is unaffected by a change that, by construction, only ever deletes a declaration or turns it into an equivalent expression statement.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. The properties below correspond to part (d) of this design's required coverage.*

### Property 1: Supported-category dispatch returns a shape, not a throw

*For any* `SecurityScanResult` with `category` in `{ "UNUSED_VARIABLE", "UNCAUGHT_EXCEPTION" }`, *for any* syntactically valid TypeScript source text, and *for any* `RemediationOptions` (or no third argument), calling `planRemediation` SHALL return either `null` or a value conforming to the `MutationRequest` shape, and SHALL NOT throw.

**Validates: Requirements 1.1, 1.3, 1.4**

### Property 2: Unsupported categories always yield null

*For any* `SecurityScanResult` whose `category` is not `"UNUSED_VARIABLE"` and not `"UNCAUGHT_EXCEPTION"`, and *for any* source text and options, `planRemediation` SHALL return `null`.

**Validates: Requirements 1.6**

### Property 3: Determinism

*For any* `SecurityScanResult`, source text, and `RemediationOptions` (including an omitted third argument), calling `planRemediation` twice with the same (deep-equal) arguments SHALL produce deeply equal results.

**Validates: Requirements 1.5, 1.8, 1.9, 1.11**

### Property 4: Unresolvable target yields null

*For any* `SecurityScanResult` whose `range` does not correspond to any node reachable from the parsed source text (e.g. an out-of-bounds or mismatched offset), `planRemediation` SHALL return `null`, regardless of `options`.

**Validates: Requirements 1.7**

### Property 5: Unused-variable removal eliminates the finding on re-analysis

*For any* function body containing a declared-but-unused variable (with or without a side-effecting initializer, and whether declared alone or alongside other declarators in the same statement), applying the `MutationRequest` returned by `planRemediation` for its `UNUSED_VARIABLE` finding, then re-running topology analysis on the result, SHALL no longer report that variable name in `unusedVariables` for that function, and all sibling declarators from the same original statement SHALL still be present and declared.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 6: Unused-variable removal targets only the declared variable

*For any* `UNUSED_VARIABLE` finding whose variable name is not declared inside the finding's target function, `planRemediation` SHALL return `null`.

**Validates: Requirements 2.5**

### Property 7: The `errorCause` option selects the Catch_Form

*For any* function containing at least one call expression or throw statement not already inside a try block, and for its `UNCAUGHT_EXCEPTION` finding, calling `planRemediation` with `{ errorCause: true }` SHALL produce a `MutationRequest` whose inserted catch clause is the Cause_Form (containing a `{ cause: ... }` option), and calling it with `{ errorCause: false }`, with `options` omitting the `errorCause` field, or with the third argument omitted entirely, SHALL produce the Plain_Form (containing the template-literal message and no `cause` option).

**Validates: Requirements 1.10, 3.1, 3.2**

### Property 8: Uncaught-exception wrapping eliminates the finding on re-analysis, in either form

*For any* function containing at least one call expression or throw statement not already inside a try block, and *for any* value of `errorCause`, applying the `MutationRequest` returned by `planRemediation` for its `UNCAUGHT_EXCEPTION` finding, then re-running `hasUncaughtExceptionPath` on the result, SHALL yield `false` for that function.

**Validates: Requirements 3.4**

### Property 9: A throwing function still throws after remediation, with context, in either form

*For any* function whose body, when executed with some input, causes an uncaught throw (synchronously, or via promise rejection when the function is `async`), and *for any* value of `errorCause`, applying the `MutationRequest` returned by `planRemediation` for its `UNCAUGHT_EXCEPTION` finding and then executing the remediated function with the same input SHALL still throw (or reject) to the caller. When `errorCause` is `true`, the thrown error's message SHALL equal `"<functionName> failed"` and its `cause` SHALL equal the original thrown value. When `errorCause` is `false`, the thrown error's message SHALL equal `"<functionName> failed: "` followed by the string conversion of the original thrown value, and the thrown error SHALL have no `cause`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7**

### Property 10: Uncaught-exception plans use exactly two zero-width insertion splices, regardless of form

*For any* non-null `MutationRequest` returned for an `UNCAUGHT_EXCEPTION` finding, under either value of `errorCause`, its `splices` array SHALL have length 2, each splice SHALL satisfy `startIndex === endIndex`, and the text of the original function body between the two insertion points SHALL be identical before and after applying the request.

**Validates: Requirements 3.8**

### Property 11: Async functions stay wrapped in the same async function

*For any* `async` function with an `UNCAUGHT_EXCEPTION` finding and a non-null plan, under either value of `errorCause`, applying the plan SHALL preserve the function's `async` modifier and signature, and the inserted `try`/`catch` SHALL be the only new syntactic wrapper inside its body.

**Validates: Requirements 3.7**

### Property 12: No file system access

*For any* `SecurityScanResult`, source text, and `RemediationOptions` (either value of `errorCause`), calling `planRemediation` SHALL perform no file system access.

**Validates: Requirements 1.9, 5.11**

### Property 13: Splices are non-overlapping and in-bounds

*For any* non-null `MutationRequest` returned by `planRemediation`, every splice SHALL satisfy `0 <= startIndex <= endIndex <= sourceText.length`, and no two splices in the same request SHALL have overlapping `[startIndex, endIndex)` ranges.

**Validates: Requirements 4.2, 4.3**

### Property 14: Round trip

*For any* non-null `MutationRequest` returned by `planRemediation`, applying it through the Mutator and then rolling back with the resulting `RollbackRecord` SHALL produce source text byte-identical to the original.

**Validates: Requirements 4.4**

### Property 15: Applied result always parses

*For any* non-null `MutationRequest` returned by `planRemediation`, the source text produced by applying it SHALL parse with zero syntax errors.

**Validates: Requirements 4.1, 4.5**

### Property 16: Adapter spell assignment mirrors the planner result

*For any* `SecurityScanResult` (scanner-reported or Synthetic_Finding) and any source text held in `analyzedSources`, the `suggestedSpell` of the entity built for that finding SHALL equal the splices of `planRemediation(finding, sourceText, { errorCause: true })` when that call returns non-null, and SHALL be `null` when that call returns `null`.

**Validates: Requirements 6.1, 6.2, 6.5**

### Property 17: Unused-variable entities are merged, not duplicated

*For any* function with a set of unused-variable names and a set of `UNUSED_VARIABLE` findings for that function, the adapter SHALL produce exactly one entity per unique unused-variable name: a finding-backed entity when a matching finding exists, and a Direct_Zombie entity (built from a Synthetic_Finding) when it does not — never both for the same name, and never zero for a name present in `fn.unusedVariables`.

**Validates: Requirements 6.3, 6.4**

## Error Handling

- **Unsupported category** (`category` not in the two supported values): return `null` immediately, before any parsing work (Requirement 1.6).
- **Unlocatable target node**: return `null` after the AST walk fails to find a containing function or declaration (Requirements 1.7, 2.5).
- **Omitted or partial options**: `options?.errorCause ?? false` is the only normalization step; there is no other way to misconfigure the call, and no path raises an error for an omitted `options` argument or an omitted `errorCause` field (Requirements 1.10, 1.11).
- **No throw paths**: `planRemediation` is designed to never throw for any input accepted by its TypeScript parameter types; all "can't fix this" cases are expressed as `null`, not exceptions, so callers (including the NECRO adapter) never need a try/catch around the call itself.
- **Mutator-side errors** (`SpliceConflictError`) are a defense-in-depth backstop, not an expected path — Properties 10 and 11 are written precisely so the planner never hands the mutator an invalid request in the first place.

## Testing Strategy

- **Unit tests** (`remediation/unusedVariable.test.ts`, `remediation/uncaughtException.test.ts`-style, colocated or under `tests/pbt/` per the existing repo convention) cover the concrete examples from Requirement 3.1/3.2 (void-returning, value-returning, and `async` functions all get the same rethrow shape in both the Cause_Form and the Plain_Form), Requirement 2.5 (unknown variable name), and Requirement 1.6/1.7 (unsupported category, unlocatable range).
- **Property tests** (`packages/morpheus-ast-core/tests/pbt/remediation.pbt.test.ts`, fast-check + jest, ≥100 iterations each) implement Properties 1–17 above, drawing inputs both from fast-check generators of small synthetic TypeScript source snippets (including a generator for `errorCause: true | false | undefined` and an omitted third argument) and from files in the Sample_Repo, per Requirement 5.7.
- Each property test is tagged `Feature: deterministic-remediation, Property N: <title>` per the required tag format, and references the design property it checks.
