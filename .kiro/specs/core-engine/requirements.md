# morpheus-ast-core: Requirements (EARS)

Format: `WHEN <trigger> THE SYSTEM SHALL <response>`. Error cases use
`IF <condition> THEN THE SYSTEM SHALL <response>`. Properties that always hold use
`THE SYSTEM SHALL <response>`. Each requirement states how it is verified, and says plainly when it
is not yet verified.

Test files are in `packages/morpheus-ast-core/tests/pbt/`.

## Parsing

**REQ-CE-001.** WHEN `parseSourceFiles` receives `filePaths` and `virtualFiles`, THE SYSTEM SHALL return
one `ParsedFile` per input, disk files first and then virtual files, each with a node count and its
syntax errors.
*Verified by:* `sample-repo.test.ts` (virtual files). Disk input is covered only indirectly.

**REQ-CE-002.** WHEN `parseSourceFiles` receives only `virtualFiles`, THE SYSTEM SHALL NOT access the
file system.
*Verified by:* `sample-repo.test.ts` runs the pipeline with `filePaths: []`. There is no test that
fails on a file-system access.

**REQ-CE-003.** IF a file path cannot be read, THEN THE SYSTEM SHALL return a `ParsedFile` with
`hasErrors` true and an error message instead of throwing.
*Not yet verified:* no test.

**REQ-CE-004.** WHEN `includeSourceText` is false or a file has syntax errors, THE SYSTEM SHALL leave
that file out of the topology.
*Not yet verified:* no test.

**REQ-CE-005.** WHEN `TreeSitterParser.withTree` finishes, or its visitor throws, THE SYSTEM SHALL have
called `tree.delete()` exactly once for that parse.
*Verified by:* `tree-sitter-wasm.test.ts` W1 (generated inputs) and W2 (throwing visitor).

**REQ-CE-006.** WHEN `TreeSitterParser` performs 1000 consecutive parses, THE SYSTEM SHALL keep WASM heap
growth at or below 2 MB.
*Verified by:* `tree-sitter-wasm.test.ts` W4, which measured 0 MB, and showed 83 MB growth for 300
parses without `delete()`.

**REQ-CE-007.** WHEN `TreeSitterParser` parses a source containing non-ASCII text, THE SYSTEM SHALL
report node offsets as UTF-16 indexes into that string.
*Verified by:* `tree-sitter-wasm.test.ts` W3.

## Topology

**REQ-CE-008.** WHEN `buildTopologyGraph` receives parsed files, THE SYSTEM SHALL create one
`FunctionNode` per function declaration, function expression, arrow function and method, with McCabe
complexity equal to 1 plus the number of `if`, `for`, `for-in`, `for-of`, `while`, `do`, `case`,
`catch`, `?:`, `&&`, `||` and `??`.
*Verified by:* `sample-repo.test.ts` checks the complexity of two sample functions. There is no
unit test of the counting rules.

**REQ-CE-009.** WHEN a call's callee name matches a function in the same file, THE SYSTEM SHALL create a
directed edge to it. WHEN it matches no function in the same file and exactly one function in the
whole input has that name, THE SYSTEM SHALL create a cross-file edge. WHEN more than one function has
that name, THE SYSTEM SHALL create no edge.
*Verified by:* `sample-repo.test.ts` (cross-file edges exist). The ambiguous-name case has no test.

**REQ-CE-010.** WHEN functions call each other in a cycle, THE SYSTEM SHALL set `hasCircularDep` on the
functions in the cycle, `isCyclic` on the edges between them, and report the number of cycles in
`circularDepCount`.
*Verified by:* `sample-repo.test.ts`.

**REQ-CE-011.** WHEN a function declares a local variable that is never read, or contains a call or
`throw` outside any `try`, THE SYSTEM SHALL list the variable in `unusedVariables` or set
`hasUncaughtException`.
*Verified by:* `sample-repo.test.ts`.

## Fault injection and blast radius

**REQ-CE-012.** WHEN `injectFault` receives a function id present in the graph, THE SYSTEM SHALL return
`affectedNodes` that starts with that id, contains no duplicates, and contains only ids from the graph.
*Verified by:* `stress.pbt.test.ts` S5 and `blast-radius.pbt.test.ts` P3, P4.

**REQ-CE-013.** IF `injectFault` receives a function id that is not in the graph, THEN THE SYSTEM SHALL
throw `FaultInjectionError`.
*Verified by:* `blast-radius.pbt.test.ts` P8.

**REQ-CE-014.** THE SYSTEM SHALL return `blastRadiusScore` and `centralityScore` in the range 0 to 1 for
any graph, including graphs with self-loops, duplicate edges and edges to missing functions.
*Verified by:* `stress.pbt.test.ts` S5, S6 and `blast-radius.pbt.test.ts` P1, P2.

**REQ-CE-015.** WHEN `injectFault` runs, THE SYSTEM SHALL return a `cascadePath` whose depths never
decrease.
*Verified by:* `stress.pbt.test.ts` S5. The per-fault-type rules in design section 5 are not asserted
individually.

**REQ-CE-016.** WHEN function ids are `__proto__`, `constructor`, `prototype` or other names that exist
on `Object.prototype`, THE SYSTEM SHALL produce valid results and leave `Object.prototype` unchanged.
*Verified by:* `stress.pbt.test.ts` S5 and `blast-radius.pbt.test.ts` P5.

**REQ-CE-017.** WHEN `injectFault` returns taint paths, THE SYSTEM SHALL set every path's `sourceId` to
the target function id.
*Verified by:* `blast-radius.pbt.test.ts` P7 and `stress.pbt.test.ts` S5.

**REQ-CE-018.** WHEN `computeBlastRadius` is called for a function in the graph, THE SYSTEM SHALL return a
centrality rank from 1 to the number of functions, scores from 0 to 1, and reachable nodes that exclude
the function itself.
*Verified by:* `stress.pbt.test.ts` S6.

## Surgical mutator

**REQ-CE-019.** WHEN a splice batch is valid, THE SYSTEM SHALL produce the same text as rebuilding the
string left to right from the ranges, regardless of the order the splices were supplied in.
*Verified by:* `stress.pbt.test.ts` S1, S3 (arbitrary Unicode sources, adjacent and zero-width ranges).

**REQ-CE-020.** WHEN a mutation is rolled back, THE SYSTEM SHALL restore the source exactly, for splices
that grow, shrink, delete or insert text, in memory and on disk.
*Verified by:* `stress.pbt.test.ts` S1, S4; `mutator.pbt.test.ts` P2, P6, P7, P8 (`bugfix-002`).

**REQ-CE-021.** IF two splices in a batch overlap, THEN THE SYSTEM SHALL throw `SpliceConflictError`
before changing any text.
*Verified by:* `mutator.pbt.test.ts` P4. `stress.pbt.test.ts` S2 covers batches that share a start index.

**REQ-CE-022.** IF a splice is out of bounds or its start is after its end, THEN THE SYSTEM SHALL throw
`MutationError` before changing any text.
*Verified by:* `mutator.pbt.test.ts` P5. The start-after-end case has no test.

**REQ-CE-023.** IF a splice boundary falls between the two halves of a UTF-16 surrogate pair, THEN THE
SYSTEM SHALL throw `MutationError` and leave the file unchanged.
*Verified by:* `stress.pbt.test.ts` S7, S8 (`bugfix-003`).

**REQ-CE-024.** IF a file-backed mutation request is empty or targets more than one file, THEN THE SYSTEM
SHALL throw `MutationError`.
*Not yet verified:* no test.

**REQ-CE-025.** WHEN `applyMutationToText` or `rollbackMutationText` is called, THE SYSTEM SHALL perform
no file I/O.
*Verified by:* `sample-repo.test.ts` (in-memory mutation and rollback). The lazy `fs/promises`
import is by construction and has no test.

## Bugfix specs, security, sample repository

**REQ-CE-026.** WHEN `generateBugfixSpec` receives a fault result and graph, THE SYSTEM SHALL return a
`BugfixSpec` with non-empty current, expected and unchanged behaviour.
*Verified by:* `sample-repo.test.ts`.

**REQ-CE-027.** WHEN `runSecurityScan` receives parsed files, THE SYSTEM SHALL return findings for
uncaught-exception paths, unused variables, circular calls and functions with complexity of at least 15.
*Verified by:* `sample-repo.test.ts` (uncaught-exception and unused-variable findings, and at least five findings).

**REQ-CE-028.** WHEN `SecurityIngestionAdapter` receives SonarQube, Snyk, AWS Security Hub or Aikido
findings, THE SYSTEM SHALL map each to a `SecurityScanResult`.
*Not yet verified:* no test, and the adapter is not exposed through the engine.

**REQ-CE-029.** WHEN `generateBedrockPatch` receives a fault result, THE SYSTEM SHALL return a suggestion
with splices, rationale and confidence. IF the model response is not valid JSON, THEN THE SYSTEM SHALL
return a suggestion with no splices and confidence 0. IF the call fails, THEN THE SYSTEM SHALL throw
`BedrockAdvisorError`.
*Not yet verified:* needs credentials or a stubbed client.

**REQ-CE-030.** WHEN `getSampleRepository` is called, THE SYSTEM SHALL return three in-memory files that
parse with no syntax errors and yield at least 12 functions, 8 edges and 1 call cycle, with the
documented flaws present.
*Verified by:* `sample-repo.test.ts`.

## Engine facade and isolation

**REQ-CE-031.** WHEN `createEngine` is called, THE SYSTEM SHALL return an object implementing every
member of `MorpheusASTEngine`.
*Verified by:* `tsc --noEmit` (the return type is checked) and `sample-repo.test.ts` (end to end).

**REQ-CE-032.** THE SYSTEM SHALL NOT import from `apps/` inside the core, SHALL NOT use the `any`
type, and SHALL NOT use application vocabulary in core source or tests.
*Verified by:* `scripts/check-boundaries.mjs` rules R1, R4, R5. R5 was checked against a deliberately
bad file.

**REQ-CE-033.** THE SYSTEM SHALL NOT import `web-tree-sitter` from the default entry point.
*Verified by:* inspection of `src/index.ts`; there is no automated test.
