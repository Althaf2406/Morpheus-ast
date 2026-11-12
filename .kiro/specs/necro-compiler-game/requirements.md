# NECRO-COMPILER — Requirements (EARS Notation)
## App 2: 3D Gothic Dungeon Crawler & Codebase Exorcist

All requirements use **EARS (Easy Approach to Requirements Syntax)**.

---

## REQ-NC-001: Repository-to-Dungeon Transformation

WHEN a user provides a source repository,
THE SYSTEM SHALL parse all TypeScript and JavaScript source files via
`adapter.ts` → `contracts.ts` and render a 3D Gothic Dungeon where each
module is a castle wing, each function is a room sized by Cyclomatic
Complexity, and each call edge is a corridor.

## REQ-NC-002: Boss Room Generation

WHERE a function node has a Cyclomatic Complexity score greater than or
equal to 15,
THE SYSTEM SHALL render that function as a Boss Room populated with a
Poltergeist Demon entity using the `complexity` field from `FunctionNode`.

## REQ-NC-003: Circular Dependency Corridor

WHERE the `TopologyGraph` contains a cycle (circular dependency) between
two or more modules,
THE SYSTEM SHALL render the connecting corridors as Infinite Loop Curse
passages that visually loop back to their origin point.

## REQ-NC-004: Unused Variable Zombie

WHERE a `SecurityScanResult` has `category` equal to `UNUSED_VARIABLE`,
THE SYSTEM SHALL spawn a Zombie Variable entity in the room corresponding
to the function that contains the unused variable.

## REQ-NC-005: Uncaught Exception Poltergeist

WHERE a `SecurityScanResult` has `category` equal to `UNCAUGHT_EXCEPTION`
or `severity` equal to `HIGH` or `CRITICAL`,
THE SYSTEM SHALL spawn a Poltergeist Demon entity in the corresponding
function room, with boss-level rendering for `CRITICAL` severity findings.

## REQ-NC-006: Refactoring Spell Cast

WHEN a player casts a Refactoring Spell on a monster,
THE SYSTEM SHALL call `applySurgicalMutation()` with the pre-computed
`SpliceRange` for that node, apply the surgical AST patch to the source
file, destroy the monster entity, and update the room's Cyclomatic
Complexity score in the dungeon.

## REQ-NC-007: Spell Rollback (Undo)

WHEN a player activates the Undo Spell action,
THE SYSTEM SHALL call `rollbackMutation()` and restore the source file to
its byte-for-byte pre-mutation state within 100 milliseconds.

## REQ-NC-008: Bedrock Spell Advisor

WHEN a player targets a monster for a spell cast,
THE SYSTEM SHALL call `generateBedrockPatch()` and display the AI-suggested
`SpliceRange` as a "Holy Incantation" hint overlay within 3 seconds of
first token from Amazon Bedrock.

## REQ-NC-009: Functional Spookiness — Real Mutation Proof

WHEN a Refactoring Spell destroys a monster,
THE SYSTEM SHALL display a real-time diff in the Live Engine Inspector
confirming that the source file on disk has been mutated, using the
`RollbackRecord` from the last `MutationResult`.

## REQ-NC-010: Security Scan → Monster Population

WHEN a repository is loaded,
THE SYSTEM SHALL call `runSecurityScan()` and map each `SecurityScanResult`
to the appropriate monster type (Poltergeist Demon, Zombie Variable, or
Shadow Lint Ghost) based on `severity` and `category`.

## REQ-NC-011: Live Engine Inspector Toggle

WHEN the player activates the Live Engine Inspector Toggle,
THE SYSTEM SHALL display a transparent telemetry overlay showing the raw
AST node list, Cyclomatic Complexity scores, active splice ranges, and
mutation log, refreshing at a maximum interval of 100 ms.

## REQ-NC-012: Dependency Isolation

THE SYSTEM SHALL NOT import any module from `packages/morpheus-ast-core/`
other than the typed interfaces exported from `contracts.ts`.

IF a build-time boundary check (`lint:boundaries`) detects a violation,
THEN THE SYSTEM SHALL fail the CI pipeline with a non-zero exit code and
print the offending import path.

## REQ-NC-013: Performance — Dungeon Rendering

WHILE the dungeon contains up to 300 rooms,
THE SYSTEM SHALL maintain a minimum of 30 frames per second on a device
with a mid-range GPU (equivalent to NVIDIA GTX 1060 or Apple M1).

## REQ-NC-014: Performance — Spell Cast Latency

WHEN `applySurgicalMutation()` is called,
THE SYSTEM SHALL complete the AST mutation and file write within
500 milliseconds for functions up to 500 lines in length.

## REQ-NC-015: No-Login Public Access

THE SYSTEM SHALL be accessible at a public URL without authentication,
with a pre-loaded sample repository available on page load so judges
can immediately test Refactoring Spells without uploading code.
