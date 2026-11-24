# morpheus-ast-core: Tasks

`[x]` means built and checked by a test or command named on the line. `[ ]` is open.
Requirement ids refer to `requirements.md`.

## Wave 1: Foundation (done)

- [x] Monorepo, `LICENSE`, strict `tsconfig`, Jest config. Check: `tsc --noEmit`.
- [x] `contracts.ts`: typed public API, no `any`. Check: `tsc`, `lint:boundaries` R4.
- [x] Import boundary lint, including no application vocabulary in core (R1 to R5). Check: `lint:boundaries`; R5 against a bad file.
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

## Wave 4: Open work

Contract and integration gaps that block app features:

- [ ] Expose the bugfix markdown renderer (`BugfixSpecGenerator.toMarkdown`) through the contract; apps cannot produce `bugfix.md` without it.
- [ ] Expose external-scanner ingestion (SonarQube, Snyk, AWS Security Hub, Aikido) through the engine and add tests (REQ-CE-028).

Missing tests for existing behaviour:

- [ ] Unreadable path and `includeSourceText: false` behaviour (REQ-CE-003, -004).
- [ ] Ambiguous callee names create no edge (REQ-CE-009).
- [ ] Start-after-end splice, empty and multi-file requests (REQ-CE-022, -024).
- [ ] Per-fault-type cascade rules asserted individually (REQ-CE-015).
- [ ] Bedrock advisor with a stubbed client: valid, malformed and failing responses (REQ-CE-029).
- [ ] Automated check that the default entry does not import `web-tree-sitter` (REQ-CE-033).

Known weaknesses to fix:

- [ ] Validate Bedrock splices (required fields, bounds) before returning them.
- [ ] Label taint paths for `UNCAUGHT_EXCEPTION` accurately instead of `PROTOTYPE_POLLUTION`.
- [ ] Measure performance and set budgets (none measured yet).
- [ ] Build `dist/` and check the `exports` map, including `morpheus-ast-core/tree-sitter`.
- [ ] Optional: let `createEngine` use Tree-sitter when a grammar is supplied.
