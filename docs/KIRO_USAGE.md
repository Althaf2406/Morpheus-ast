# How Kiro was used to build MORPHEUS-AST

Everything below points to files committed in this repository. The whole `.kiro/` folder is tracked (see `.gitignore`, which explicitly forbids ignoring it).

```
.kiro/
├── specs/       7 feature specs + bugfixes/ (7 bugfix specs)
├── steering/    4 steering files
├── hooks/       3 files, 4 hooks
└── settings/    mcp.json
```

## 1. Spec-driven development

Each feature spec follows the same flow: **requirements.md** (EARS style, `WHEN ... THE SYSTEM SHALL ...`) then **design.md** (architecture, interfaces, numbered correctness properties) then **tasks.md** (checklist; each task names the requirement it satisfies and the test or command that proves it).

| Spec folder | What it delivered |
|---|---|
| [`core-engine`](../.kiro/specs/core-engine/) | The headless engine in `packages/morpheus-ast-core`. 36 `REQ-CE-*` requirements, each stating how it is verified (or plainly that it is not yet verified). Tasks are grouped in waves: foundation, parsing and topology, analysis and mutation, application-facing work. A "Wave 5: Open work" section lists what is still undone, such as a real Bedrock call and performance budgets. |
| [`necro-compiler-game`](../.kiro/specs/necro-compiler-game/) | The original NECRO-COMPILER plan (`TASK-NC-01` to `TASK-NC-15`): adapter, dungeon layout, monsters with GLSL shaders, spell cast, undo, inspector. Audio, the Holy Incantation overlay and several QA tasks are still unchecked in the file. |
| [`infrashield-chaos`](../.kiro/specs/infrashield-chaos/) | The original InfraShield plan (`TASK-IS-01` to `TASK-IS-16`): fault injector, advisor, bugfix generator, ingestion, city, fault animation, dashboard, inspector, Generate Bugfix Spec button. Audio, cross-browser checks, profiling and deploy tasks are unchecked in the file. |
| [`necro-real-engine-integration`](../.kiro/specs/necro-real-engine-integration/) | Replaced the game's mock data with the real engine through `NecroCompilerAdapter`: lazy adapter loading, loading and error screens, stable room positions, a real-engine integration test, and entity-id stability across cast and undo. |
| [`deterministic-remediation`](../.kiro/specs/deterministic-remediation/) | `planRemediation` in core: surgical splice plans for `UNUSED_VARIABLE` and `UNCAUGHT_EXCEPTION`, with no AI service. Gave NECRO monsters real spells instead of `suggestedSpell: null`. Property tests check that the fix removes the finding on re-analysis and that rollback is byte-exact. |
| [`infrashield-real-engine-integration`](../.kiro/specs/infrashield-real-engine-integration/) | Moved InfraShield from mock files to the real engine: in-memory virtual copy of the sample repo, deterministic patch, apply and rollback, force-directed city layout, lazy loader, fault selector, dashboard wiring. Nine numbered correctness properties. |
| [`necro-visual-polish`](../.kiro/specs/necro-visual-polish/) | Scale function for monsters and pillars, boss rooms, torches under a four-light budget, ember field, stone floor shader, bloom and fog, room-focus camera, HUD counters, and CPU performance budgets for up to 300 rooms. 25 numbered properties. |

Four specs (`deterministic-remediation`, `infrashield-real-engine-integration`, `necro-real-engine-integration`, `necro-visual-polish`) contain a `.config.kiro` file with the spec workflow type (`fast-task`). Six specs contain a `tasks.meta.json` that Kiro wrote to record which chat sessions executed which tasks.

### Bugfix specs

[`.kiro/specs/bugfixes/`](../.kiro/specs/bugfixes/) holds seven specs in Kiro's bugfix format: **Current Behavior (Defect)**, **Expected Behavior (Correct)**, **Unchanged Behavior / Preservation**. The product also generates this format itself (the "Generate Bugfix Spec" button in InfraShield, `bugfix-generator.ts` in core).

| Spec | Defect | How it was found |
|---|---|---|
| `bugfix-001` | Prototype-pollution risk in blast-radius traversal | Preventive hardening. Not caused by a failing test. Property P5 guards it. |
| `bugfix-002` | Rollback restored wrong text when replacement length differed from original | fast-check properties P6, P7, P8 in `mutator.pbt.test.ts` |
| `bugfix-003` | Splice boundary inside a UTF-16 surrogate pair corrupted files on disk | fast-check property S4 in `stress.pbt.test.ts` (seed `1058610110`, shrunk 39 times) |
| `bugfix-004` | Bedrock patch suggestions were not validated | `bedrock-advisor.test.ts` against the old validator: 17 of 20 tests failed |
| `bugfix-005` | External scanner findings were misattributed, or crashed the mapper | `security-ingestion.test.ts` against the old mapper: 6 of 10 tests failed |
| `bugfix-006` | Model text could break out of the generated `bugfix.md` code fence | test F3 in `engine-facade.test.ts` |
| `bugfix-007` | Adapters gave the AI advisor placeholder text and mixed up faults | Code review. Not observed as a failing test first (the spec says so). Checked with `pnpm run verify:adapters`. |

## 2. Steering files

In [`.kiro/steering/`](../.kiro/steering/):

| File | Inclusion | Rules it enforces |
|---|---|---|
| `00-skeleton-isolation.md` | `always` | The three-folder monorepo layout. Core never imports from `apps/`. Core has no UI dependency and no domain vocabulary. Apps use core only through `contracts.ts`; only `apps/*/src/adapter.ts` may import `src/index`. No `any`, `strict: true`, `tree.delete()` after Tree-sitter use. `pnpm run lint:boundaries` must pass before commit. |
| `ast-surgical-splice.md` | `always` | All mutations are line-range splices (`SpliceRange`), applied in descending order, `SpliceConflictError` on overlap, a `RollbackRecord` for every mutation. Defines the two invariants checked by property tests: valid syntax after mutation (Fix) and `rollback(mutate(x)) === x` (Round-Trip). Lists forbidden patterns such as string `replace()` on source text. |
| `chaos-engineering-sre.md` | `fileMatch` on `apps/infrashield-chaos/**/*` | The "Cyber City" metaphor (function = building, height = complexity, edge = road) and the color semantics (healthy, affected, faulted, cyclic). UI imports only from `./adapter`. `InstancedMesh`, dispose on unmount, `prefers-reduced-motion`, components under 150 lines. |
| `necro-dungeon-lore.md` | `fileMatch` on `apps/necro-compiler-game/**/*` | The lore mapping (monster = smell, room = file, spell = real mutation, undo = byte-for-byte restore). UI imports only from `./adapter`; the UI never mutates files. Shaders in `src/shaders/*.glsl`, scene code in `src/components/dungeon/`. |

`fileMatch` steering means app-specific rules are only loaded while working on that app, so the core's domain-free rules are not diluted by lore.

The boundary rules in `00-skeleton-isolation.md` are not only advice. `scripts/check-boundaries.mjs` implements them as rules R1 to R5 and fails with exit code 1 on a violation. The `core-engine` tasks note that R5 was tested against a bad file and "caught a stray word in a test".

## 3. Hooks

All in [`.kiro/hooks/`](../.kiro/hooks/).

| Hook | File | Trigger | What it does |
|---|---|---|---|
| `ast-roundtrip-and-isolation-guard` | `ast-roundtrip-guard.json` | `PostFileSave` on `packages/morpheus-ast-core/src/**/*.ts` | Runs `pnpm run lint:boundaries && pnpm --filter morpheus-ast-core run test:pbt`. Every save in core re-checks isolation and the property tests. 60 s timeout. |
| `dual-app-contract-sync-agent` | `dual-app-contract-sync.json` | `PostFileSave` on `packages/morpheus-ast-core/src/contracts.ts` | Starts a Kiro **agent** with a prompt: check that both `adapter.ts` files still implement `MorpheusASTEngine`, that adapters import only `contracts.ts` from core (see the note below), and fix only the adapters. Reports `ADAPTERS IN SYNC` if nothing changed. 90 s timeout. |
| `security-precommit-scanner` | `security-precommit-scanner.json` | `Stop` (end of a session) | Runs `node scripts/scan-secrets.mjs` over staged, modified and untracked files for keys, tokens, passwords, private keys and credential URLs. Prints file and line, never the secret. |
| `security-precommit-scanner-agent` | `security-precommit-scanner.json` | `Stop` | A second, semantic pass by a Kiro agent for obfuscated credentials and high-entropy strings under `packages/` and `apps/`. Answers `SECURITY SCAN CLEAN` when nothing is found. |

Note: the sync hook prompt says adapters may import only `contracts.ts`. The current rule in `00-skeleton-isolation.md` also lets `adapter.ts` import `src/index` for `createEngine()`. The hook text predates that refinement.

The secret scanner is also listed as done in `core-engine/tasks.md` ("tested with a planted secret").

## 4. Property-based testing with fast-check

`fast-check` 3.19.0 is a dependency of the core and of both apps. The requirement files say how each requirement is verified, and the design files list numbered properties that the tests then implement.

### Core: `packages/morpheus-ast-core/tests/pbt/` (Jest)

| File | Properties checked |
|---|---|
| `mutator.pbt.test.ts` | P1 Fix: mutated source stays valid TypeScript. P2 Round-Trip: `rollback(apply(s)) === s` byte for byte. P3 result independent of splice order. P4 overlaps throw `SpliceConflictError`. P5 out-of-range splices throw `MutationError`. P6 to P8 multi-splice, deletion and pure insertion round-trip. |
| `stress.pbt.test.ts` | S1 matches a left-to-right oracle and round-trips. S2 shared start index throws or round-trips. S3 order independence. S4 file-backed round-trip is byte-exact. S5 and S6 blast-radius invariants on hostile graphs. S7 surrogate-pair boundaries are rejected and the file is unchanged. S8 whole astral character replacement round-trips. |
| `blast-radius.pbt.test.ts` | P1 and P2 scores in [0, 1]. P3 affected nodes exist in the graph. P4 target is always affected. P5 IDs like `__proto__` do not corrupt the map. P6 single-node graph scores 1.0. P7 taint path sources equal the target. P8 unknown target throws `FaultInjectionError`. |
| `mutation-diff.pbt.test.ts` | P1 diff hunks rebuild before and after text exactly. P2 no-op mutations give no hunk. P3 fingerprints are equal for equal text and differ otherwise. P4 and P5 re-indented lines differ only in leading whitespace and hunks still rebuild both texts. Also checks the standard SHA-256 test vector. |
| `remediation.pbt.test.ts` | Applying an unused-variable plan removes the variable and keeps siblings. Splices stay inside the declaration and keep side effects. `errorCause` selects the catch form. Re-analysis shows no uncaught exception after the plan. The remediated function still throws with context. Splices are insertions that remove no original text. Indentation and `async` are preserved. `planRemediation` does no file system access. |
| `engine-facade.test.ts` | F4 any replacement text stays inside its markdown fence. F7 and F8 same input gives same finding IDs and duplicates get distinct IDs. **F9 analysing the same source twice yields the same ID set. F10 apply then rollback yields the same ID set as before.** |
| `security-ingestion.test.ts` | I9 arbitrary JSON input gives well-formed results with unique IDs. I10 arbitrary severity strings map to a valid severity. I8 malformed entries never throw. |
| `bedrock-advisor.test.ts` | B15 for arbitrary model output, a returned patch is always in bounds and applies cleanly. Other tests cover rejection of bad offsets, overlaps, surrogate boundaries and more than 20 splices. Uses an injected stub client. |
| `tree-sitter-wasm.test.ts` | W1 every parse allocates and deletes exactly one tree. W2 a throwing visitor still releases the tree. W3 offsets are UTF-16 indexes. W4 1000 parses with `delete()` keep the WASM heap flat, while skipping `delete()` grows it. |
| `wasm-memory-audit.test.ts` | T3 and T4: balanced allocate and delete cycles report zero leaks, and k allocations with j < k deletions report exactly k - j. |
| `sample-repo.test.ts`, `remediation.unit.test.ts` | Example-based tests, including the full pipeline on the sample repository. |

### Apps (Vitest)

**InfraShield** (`apps/infrashield-chaos/src/`):

- `__tests__/virtualRoundTrip.pbt.test.ts`: apply then rollback restores the virtual copy byte for byte.
- `__tests__/stalePatch.pbt.test.ts`: a stale AI patch answer never overwrites a newer fault's state.
- `layout/__tests__/forceLayout.pbt.test.ts`: finite flat-plane positions, determinism, no footprint overlap, bounded total footprint.
- `layout/__tests__/frameCamera.pbt.test.ts` and `buildingScale.pbt.test.ts`: the camera keeps every building in view, building scale stays within bounds and does not shrink as complexity grows.
- `components/city/__tests__/`: cascade reveal completeness, reduced-motion colors, default target is the highest-centrality node.
- `components/panels/__tests__/`: patch label depends only on `modelId`, bugfix spec formatting always has the required sections, dashboard percentages stay in [0, 100].

**NECRO** (`apps/necro-compiler-game/src/`):

- `engine/__tests__/entityIdStability.pbt.test.ts`: zombie IDs and per-type counts survive a cast and undo round trip.
- `engine/__tests__/spellAssignment.pbt.test.ts`: spells mirror the planner result.
- `layout/__tests__/`: deterministic layout, stable room positions when rooms are added, removed or unchanged.
- `entities/__tests__/`: monster height band, boss taller than regular, linear pillar scaling, deterministic placement inside room bounds.
- `components/dungeon/__tests__/`: boss room identification, four torches per boss room, a light budget of four, deterministic allocation, flicker bounds, frozen atmosphere under reduced motion, one ember field, disposal, camera focus, reset and glide cancel.
- `spells/__tests__/spellState.pbt.test.ts` and `hud/__tests__/counterBar.pbt.test.ts`: reducer rules and counter invariants.
- `perf/__tests__/`: CPU time budgets for placement, scale, frame tick, draw calls and light count on large layouts.

## 5. MCP

[`.kiro/settings/mcp.json`](../.kiro/settings/mcp.json) configures three stdio servers, each with a stated purpose:

- `context7`: current documentation for the Tree-sitter WASM API, TypeScript Compiler API, fast-check and the Bedrock SDK, to avoid invented method signatures.
- `aws-knowledge`: AWS documentation for the Bedrock integration.
- `localstack`: local AWS emulation, intended for fault validation without AWS credentials.

It also enables three Kiro "powers" in a `kiro.powers` block (`awsSecurityAnalyzer`, `localstackAWS`, `sonarQubeSnykAikido`).

What the repo does not contain: any log or artifact showing what these servers returned. The configuration shows the intent; it does not prove a specific code change came from them. The shipped demos need none of these servers.

## 6. Spec-driven development vs. vibe coding on this project

What the repo shows:

- **Requirements said how they are verified.** `core-engine/requirements.md` marks each requirement as verified (and by which test) or "Not yet verified". Honest gaps stayed visible in `tasks.md` Wave 5 instead of hiding in chat history.
- **Properties came before code.** `design.md` files list numbered properties (25 in `necro-visual-polish`, 9 in `infrashield-real-engine-integration`), and `tasks.md` files tie each property test to those numbers. Test file headers repeat the number ("Property 16: Selecting a monster glides the camera to its room").
- **Two apps stayed on one contract.** The steering rules plus the boundary lint made it cheap to keep both apps on `contracts.ts`. A free-form conversation has no place to keep a rule like "no domain words in core" across seven features.
- **Bugs became specs.** Defects found by property tests were written up as bugfix specs with a counterexample, the fix and the preserved behavior, so each fix has a regression guard.
- **Cost.** The specs are long (about 4,500 lines of markdown under `.kiro/specs` and `steering`). For the visual work, many tests are properties of math (scale, camera, allocation), not of how the scene looks. Looks were still judged by eye.

## Most impressive Kiro moment

**Property tests found a data-loss bug that example tests missed (`bugfix-003`).**

The mutator already had passing in-memory round-trip tests. A stress property (S4) that ran the *file-backed* path on arbitrary Unicode found a counterexample after 2000 runs, shrunk 39 times: a splice boundary inside a surrogate pair (any emoji) left a lone surrogate, `writeFile` replaced it with U+FFFD, and the original character was destroyed on disk. Rollback could not restore it because the information was gone. The two strings printed identically but compared unequal.

This was a violation of the project's core invariant, `rollback(mutate(x)) === x`, in a path no hand-written test covered. The fix (reject boundaries between a high and a low surrogate before touching text or file) is in `mutator/index.ts`, and S7 and S8 now guard it. `bugfix-002` (rollback with different replacement lengths) came from the same properties.

**Runner-up: deterministic finding IDs make undo stable.** `engine-facade.test.ts` F9 and F10 assert that analysing the same source gives the same finding IDs, and that apply followed by rollback gives the same ID set as before. In NECRO, that is why a monster keeps its identity after you cast a spell and undo it (`entityIdStability.pbt.test.ts`).

The repo contains no record of a property test catching a layout bug, so none is claimed here. The layout properties (no overlap, bounded total footprint, deterministic positions) exist as guards.
