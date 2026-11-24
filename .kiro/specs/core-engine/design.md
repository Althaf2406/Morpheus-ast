# morpheus-ast-core: Design

`packages/morpheus-ast-core` is the headless, application-agnostic engine behind both apps.
It parses TypeScript/JavaScript, builds a cross-file call topology, analyses the blast radius of
faults, and applies surgical text mutations with exact rollback. This document describes the
architecture as built and verified; section 9 lists what is not yet done or not yet verified.

## 1. Principles

- **Unidirectional dependency.** The core never imports from `apps/`. Apps use only the types in
  `src/contracts.ts` and receive an engine instance from `createEngine()`.
- **Application-agnostic.** No UI code and no application vocabulary in the core. `lint:boundaries`
  enforces this (rules R1 to R5, see section 8).
- **Strict TypeScript, no `any`.** Enforced by `tsconfig` (`strict`) and lint rule R4.
- **Spec first, property tested.** Every public behaviour has a requirement in `requirements.md`
  and, where stated, a fast-check property in `packages/morpheus-ast-core/tests/pbt/`.

## 2. Architecture

```
contracts.ts   typed public API (the only file apps may import)
index.ts       createEngine(): MorpheusASTEngine
 |
 +-- parser/            TypeScript Compiler API parser (default), virtual and on-disk files
 |    +-- tree-sitter.ts   Tree-sitter WASM parser, audited, optional entry point
 +-- topology/          functions, modules, cross-file call edges, complexity, cycles
 +-- blast-radius/      fault injector, cascade, taint paths, centrality, blast radius
 +-- mutator/           surgical splice + rollback; bugfix spec generator
 +-- security/          findings from internal analysis and from external scanners
 +-- bedrock-advisor/   Amazon Bedrock patch suggestions (loaded on demand)
 +-- sample-repo/       pre-loaded in-memory sample repository
```

## 3. Parsing (two parsers, one default)

**TypeScript Compiler API (default).** `SourceParser` parses `filePaths` (read lazily via
`fs/promises`) and `virtualFiles` (text supplied by the caller). Syntax errors come from
`ts.transpileModule`, which never touches the disk. It needs no extra assets, so a browser
deployment works without hosting any `.wasm` file. `createEngine()` uses only this parser.

**Tree-sitter WASM (optional, audited).** `TreeSitterParser` is exported on its own subpath,
`morpheus-ast-core/tree-sitter`, so bundles that do not use it never load `web-tree-sitter` or
need a grammar file (about 2 MB for `tree-sitter-typescript.wasm`). `withTree(source, visit)`
parses, runs the visitor, and always calls `tree.delete()` in a `finally` block. Offsets are
UTF-16 indexes, the same unit `SpliceRange` uses. Audit evidence is in
`tests/pbt/tree-sitter-wasm.test.ts`: 1000 parses with `delete()` grew the WASM heap by 0 MB, and
300 parses without it grew the heap by 83 MB, so the measurement can detect a leak. It is not wired
into `createEngine()`.

## 4. Topology

`TopologyCompiler.build` runs two passes over files that have source text and no syntax errors.

1. Extract a `FunctionNode` for every function declaration, function expression, arrow function and
   method, with McCabe complexity = 1 + the number of `if`, `for`, `for-in`, `for-of`, `while`,
   `do`, `case`, `catch`, `?:`, `&&`, `||`, `??`. Also record unused local variables and whether the
   function has a call or `throw` outside any `try`.
2. Resolve calls. A call whose callee name matches a function in the same file links to it. Otherwise
   the name is resolved globally only when exactly one function in the input has that name, so an
   ambiguous name never creates a wrong edge. Resolution is by name, not by type, so it is an
   approximation.

Cycles are found by depth-first search with colour marking. Functions in a cycle get
`hasCircularDep`, edges between them get `isCyclic`, and `circularDepCount` counts the cycles.

## 5. Blast radius and fault injection

`FaultInjector.inject` is pure graph analysis. It never changes source text. For a target function
it runs a breadth-first cascade over call edges. A neighbour continues the cascade depending on the
fault type:

| Fault | A neighbour is affected when |
|---|---|
| `UNCAUGHT_EXCEPTION` | it has an unguarded call or `throw` |
| `NETWORK_FAILURE` | it has an unguarded call or `throw` (reported as no fallback) |
| `LATENCY` | always |
| `EXTREME_PAYLOAD` | it takes at least one parameter |

The result holds `affectedNodes` (target first, no duplicates), `cascadePath` with non-decreasing
depth, `taintPaths` (only for `EXTREME_PAYLOAD` and `UNCAUGHT_EXCEPTION`), `blastRadiusScore`
(affected / total functions) and `centralityScore` (normalised betweenness, Brandes-style).
`computeBlastRadius` is a pure query: reachable nodes, centrality, and the node's centrality rank.

All adjacency data lives in `Map` objects, never plain objects, so a function id such as
`__proto__` or `constructor` cannot touch `Object.prototype`.

## 6. Surgical mutator

A `SpliceRange` replaces `[startIndex, endIndex)` of a source string, in UTF-16 units.

- `prepareBatch` validates a batch: bounds, `start <= end`, no boundary inside a surrogate pair,
  no overlapping ranges. It then sorts the batch by `startIndex`, descending.
- `applySorted` applies the splices from the end backwards, so earlier offsets stay valid, and records
  one rollback segment per splice: original text, original offset, and `replacementLength`.
- `restoreSegments` rebuilds the original. Each segment's position in the mutated text is its
  original offset plus the length change of every earlier segment; segments are restored from the
  end backwards.
- The same helpers serve the file path (`apply` / `rollback`, which read and write the file) and the
  in-memory path (`applyToString` / `rollbackString`, exposed as `applyMutationToText` /
  `rollbackMutationText`). `fs/promises` is imported lazily, so the in-memory path loads in a browser.

Two defects found by property tests shaped this design: rollback used the original length instead of
the replacement length (`bugfix-002`), and a boundary inside a surrogate pair corrupted the file on
UTF-8 write (`bugfix-003`).

## 7. Security, Bedrock, bugfix specs, sample repository

- **Internal security analysis.** `runSecurityScan` builds the topology and reports uncaught-exception
  paths, unused variables, circular calls and functions with complexity of at least 15.
- **External scanners.** `ingestExternalFindings(report, graph)` normalises SonarQube, Snyk, AWS Security
  Hub and Aikido reports (types in `contracts.ts`) into `SecurityScanResult`. Reports are untrusted: every
  field is read defensively and nothing throws. A finding is attached to a function only when the report
  gives a line inside it (innermost function wins, after normalising separators and a SonarQube
  `projectKey:` prefix); whole-file findings have `functionId: null`.
- **Bedrock.** `BedrockAdvisor.generatePatch` asks Claude for splices **relative to the target function's
  source** and treats the reply as untrusted. It takes the file path from the graph, maps offsets to file
  offsets, and rejects the whole patch (no splices, confidence 0) if any splice is malformed, out of bounds,
  overlapping, over-long or splits a surrogate pair. A non-empty suggestion is always applicable by the
  mutator. A client can be injected, so the advisor is tested without AWS. The AWS SDK is imported on demand.
- **Bugfix specs.** `generateBugfixSpec` produces a `BugfixSpec`; `generateBugfixMarkdown` renders it as
  `bugfix.md`, keeping model-supplied text inside a code fence it cannot close.
- **Sample repository.** `getSampleRepository()` returns three in-memory files (20 functions, 29 call edges,
  one call cycle, complexity up to 20) with known flaws: high complexity, missing error handling, an
  unused variable, an unguarded merge, and a circular call.

## 8. Verification strategy

| Layer | Mechanism |
|---|---|
| Types | `tsc --noEmit` over `src` and `tests` |
| Boundaries | `pnpm run lint:boundaries`: R1 core does not import `apps/`, R2 no UI dependency in core, R3 apps import only `contracts`, R4 no `any`, R5 no application vocabulary |
| Properties | `pnpm run test:pbt`, `tests/pbt/`: blast radius, mutator, stress (arbitrary Unicode, splice batches, graphs), Tree-sitter WASM audit, sample pipeline, Bedrock advisor, scanner mapper, engine facade. `FC_RUNS=2000` for a heavy run |
| Package | `pnpm run verify:dist`: real build, `exports` map, deep-import block, default entry loads neither `web-tree-sitter` nor the AWS SDK, types under `node16` and classic resolution |
| Adapters | `pnpm run verify:adapters`: both adapters compiled in strict mode and driven against the real engine |
| Secrets | `node scripts/scan-secrets.mjs` on staged, modified and untracked files |

## 9. Known limitations and open work

- Call resolution is by name; ambiguous names produce no edge.
- `hasUncaughtException` is a heuristic: a function with any call and no `try` is flagged.
- Taint paths for `UNCAUGHT_EXCEPTION` are labelled `PROTOTYPE_POLLUTION`, which is a loose label.
- No live Bedrock call has been made. The advisor is tested with a stub client, so the real model's
  reply quality and the prompt's effectiveness are unmeasured.
- Tree-sitter is not used by `createEngine()`.
- A mutation request targets one file.
- InfraShield's adapter has no in-memory mutation path; only NECRO's does.
- No performance budgets have been measured.
- Several behaviours still lack their own test (see `tasks.md`).