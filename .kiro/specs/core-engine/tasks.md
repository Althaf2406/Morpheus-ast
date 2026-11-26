# morpheus-ast-core: Tasks

`[x]` means built and checked by a test or command named on the line. `[ ]` is open.
Requirement ids refer to `requirements.md`.

## Wave 1: Foundation (done)

- [x] Monorepo, `LICENSE`, strict `tsconfig`, Jest config. Check: `tsc --noEmit`.
- [x] `contracts.ts`: typed public API, no `any`. Check: `tsc`, `lint:boundaries` R4.
- [x] Import boundary lint, including no application vocabulary in core (R1 to R5). Check: `lint:boundaries`; R5 against a bad file, and it caught a stray word in a test.
- [x] `createEngine()` facade implementing `MorpheusASTEngine` (REQ-CE-031).

## Wave 2: Parsing and topology (done)

- [x] TypeScript Compiler API parser for disk and virtual files (REQ-CE-001, -002).
- [x] Tree-sitter WASM parser with guaranteed `tree.delete()` (REQ-CE-005 to -007).
- [x] WASM heap audit with a leaking control (REQ-CE-006).
- [x] Cross-file topology with unambiguous name resolution and cycle detection (REQ-CE-009, -010).
- [x] Complexity, unused variable and uncaught-exception analysis (REQ-CE-008, -011).

## Wave 3: Analysis and mutation (done)

- [x] Fault injector, cascade, taint paths, centrality, `computeBlastRadius` (REQ-CE-012 to -018).
- [x] Surgical mutator with exact rollback (REQ-CE-019, -020; `bugfix-002`).
- [x] Surrogate-pair guard (REQ-CE-023; `bugfix-003`).
- [x] In-memory mutation path for browser use (REQ-CE-025).
- [x] Stress suite at 2000 iterations (`stress.pbt.test.ts`).
- [x] Bugfix spec generator (REQ-CE-026) and internal security analysis (REQ-CE-027).
- [x] Pre-loaded sample repository and pipeline test (REQ-CE-030).
- [x] Secret scanner and `Stop` hook (`scripts/scan-secrets.mjs`, tested with a planted secret).

## Wave 4: Application-facing work (done)

- [x] `generateBugfixMarkdown` in the contract and engine, hardened against fence injection (REQ-CE-034; `bugfix-006`).
- [x] `ingestExternalFindings` for SonarQube, Snyk, AWS and Aikido, with correct attribution and no throwing (REQ-CE-028, -036; `bugfix-005`).
- [x] Bedrock advisor: injected client, strict validation of model output (REQ-CE-029; `bugfix-004`).
- [x] Adapters: InfraShield bugfix export and scanner ingestion, real function source for the advisor, stale-patch guard, NECRO spell-hint targeting (`bugfix-007`). Check: `pnpm run verify:adapters`.
- [x] Package build and entry points: `tsconfig.build.json`, `exports` and `typesVersions`, verified with a real build (REQ-CE-033, -035). Check: `pnpm run verify:dist`.

## Wave 5: Open work

Missing tests for existing behaviour:

- [ ] Unreadable path and `includeSourceText: false` behaviour (REQ-CE-003, -004).
- [ ] Ambiguous callee names create no edge (REQ-CE-009).
- [ ] Start-after-end splice, empty and multi-file requests (REQ-CE-022, -024).
- [ ] Per-fault-type cascade rules asserted individually (REQ-CE-015).
- [ ] McCabe counting rules asserted construct by construct (REQ-CE-008).

Known weaknesses to fix or decide:

- [ ] Make one real Bedrock call with credentials and judge prompt quality. Until then the advisor is tested only with a stub.
- [ ] Label taint paths for `UNCAUGHT_EXCEPTION` accurately instead of `PROTOTYPE_POLLUTION`.
- [ ] InfraShield: add an in-memory mutation path so a patch can be applied to the pre-loaded sample.
- [ ] Measure performance and set budgets (none measured yet).
- [ ] Optional: let `createEngine` use Tree-sitter when a grammar is supplied.
