# Requirements Document

## Introduction

The Necro Compiler game currently renders a dungeon from mock data. This feature connects the game UI to the real core engine through `NecroCompilerAdapter` in `apps/necro-compiler-game/src/adapter.ts`. The dungeon is built from `loadSampleRepository()`. Casting a spell applies a real in-memory mutation, and Undo restores the source byte for byte. The adapter module is loaded lazily so the real engine does not enlarge the initial bundle, and a gothic loading screen and error panel cover the load.

Scope decisions:
- `suggestedSpell` stays `null` on every entity. The UI does not call `getSpellHint`. Entities are selectable and the cast button is disabled with a short explanation on the entity card.
- The integration test builds its own `MutationRequest` from the sample source and entity ranges. It uses no network and no AWS.
- Files `src/adapter.ts`, `packages/`, and other apps are not edited. No commit is made.

## Glossary

- **Necro_UI**: The React and Three.js front end in `apps/necro-compiler-game/src/`.
- **Adapter**: The `NecroCompilerAdapter` class and `createNecroAdapter()` factory exported by `src/adapter.ts`.
- **Adapter_Loader**: The Necro_UI module that loads the Adapter through a dynamic `import("./adapter")`.
- **Loading_Screen**: The gothic full-screen view shown while the Adapter_Loader is pending.
- **Error_Panel**: The view shown when the Adapter_Loader or the initial repository load fails.
- **Layout**: A `DungeonLayout` value returned by `loadSampleRepository()` or `buildDungeonLayout()`.
- **Spell_Caster**: The UI-side interface used by the game state to cast and undo spells.
- **Room_Positions**: The mapping from room id to 3D position used by the dungeon renderer.
- **Entity_Card**: The UI card that shows the selected entity and the cast button.
- **Entity_Id**: The `entityId` string of a `DungeonEntity`.
- **Dying_Animation**: The DYING state animation played on an entity after a successful cast.
- **Integration_Test**: The automated test that runs the real engine through the Adapter without network access.
- **Final_Report**: The summary message delivered at the end of the implementation task.
- **Implementer**: The agent or developer who carries out the implementation tasks of this feature.
- **Boundary_Linter**: The root script run by `pnpm run lint:boundaries`.

## Requirements

### Requirement 1: Lazy Adapter Loading

**User Story:** As a player, I want the real engine to load without slowing the first paint, so that the game opens quickly.

#### Acceptance Criteria

1. THE Adapter_Loader SHALL load the Adapter through a dynamic `import("./adapter")` expression.
2. THE Necro_UI SHALL contain no static value import of `./adapter` in modules reachable from the entry point `src/main.tsx`.
3. WHEN the production build completes, THE build output SHALL contain the Adapter and core engine code in a separate chunk from the entry chunk.
4. WHEN the Necro_UI starts, THE Adapter_Loader SHALL call `createNecroAdapter()` once after the dynamic import resolves.

### Requirement 2: Gothic Loading Screen

**User Story:** As a player, I want a themed loading screen, so that waiting feels part of the game.

#### Acceptance Criteria

1. WHILE the Adapter_Loader is pending, THE Necro_UI SHALL display the Loading_Screen.
2. THE Loading_Screen SHALL display the text "Summoning the dungeon...".
3. THE Loading_Screen SHALL render text in the Cinzel font family.
4. THE Loading_Screen SHALL use colors from the existing HUD palette.
5. WHILE the user agent reports `prefers-reduced-motion: reduce`, THE Loading_Screen SHALL render without animation.
6. WHEN the initial Layout is available, THE Necro_UI SHALL replace the Loading_Screen with the dungeon scene.

### Requirement 3: Error Panel and Retry

**User Story:** As a player, I want a clear error and a way to retry, so that a failed load does not leave me stuck.

#### Acceptance Criteria

1. IF the dynamic import, `createNecroAdapter()`, or `loadSampleRepository()` rejects, THEN THE Necro_UI SHALL display the Error_Panel with the error message.
2. THE Error_Panel SHALL provide a Retry button.
3. WHEN the player activates the Retry button, THE Adapter_Loader SHALL repeat the full load sequence and THE Necro_UI SHALL display the Loading_Screen.
4. IF the dynamic import has failed, THEN THE Adapter_Loader SHALL allow a new import attempt on Retry.

### Requirement 4: Initial Layout from Sample Repository

**User Story:** As a player, I want the dungeon to come from the sample repository, so that rooms and monsters reflect real code.

#### Acceptance Criteria

1. WHEN the Adapter is created, THE Necro_UI SHALL obtain the initial Layout by calling `loadSampleRepository()`.
2. THE Necro_UI SHALL render one room for each `DungeonRoom` in the initial Layout.
3. THE Necro_UI SHALL render one corridor for each `DungeonCorridor` in the initial Layout.
4. THE Necro_UI SHALL render one entity for each `DungeonEntity` in the initial Layout.
5. WHEN the real engine is wired, THE Necro_UI SHALL import no mock data module in production code.

### Requirement 5: Real Spell Casting and Undo

**User Story:** As a player, I want to cast spells and undo them against real code, so that the game edits source code for real.

#### Acceptance Criteria

1. THE Necro_UI SHALL use the Adapter instance directly as the Spell_Caster.
2. THE Necro_UI SHALL contain no wrapper class that reimplements `castSpell` or `rollbackLastSpell`.
3. WHEN the player casts a spell, THE Spell_Caster SHALL call `castSpell` with the entity's `suggestedSpell`.
4. WHEN the player activates Undo, THE Spell_Caster SHALL call `rollbackLastSpell`.
5. IF `castSpell` or `rollbackLastSpell` rejects, THEN THE Necro_UI SHALL display the error message and keep the previous Layout.

### Requirement 6: Layout Refresh

**User Story:** As a player, I want the dungeon to update after each spell and each undo, so that I see the effect on the code.

#### Acceptance Criteria

1. WHEN `castSpell` resolves and the Dying_Animation of the target entity completes, THE Necro_UI SHALL replace the displayed Layout with the result of `buildDungeonLayout()`.
2. WHEN `rollbackLastSpell` resolves, THE Necro_UI SHALL replace the displayed Layout with the result of `buildDungeonLayout()`.
3. WHILE the Dying_Animation is playing, THE Necro_UI SHALL keep the target entity in the displayed Layout.

### Requirement 7: Stable Room Positions

**User Story:** As a player, I want rooms to stay where they are, so that I do not lose my bearings after each refresh.

#### Acceptance Criteria

1. WHEN a Layout is applied, THE Necro_UI SHALL recompute the force layout only if the set of room ids differs from the set used for the current Room_Positions.
2. WHILE the set of room ids is unchanged, THE Necro_UI SHALL keep every room position identical to its previous value.
3. WHEN a Layout adds rooms, THE Necro_UI SHALL place each new room without changing the position of any existing room.
4. WHEN a Layout removes rooms, THE Necro_UI SHALL keep the positions of the remaining rooms unchanged.

### Requirement 8: Entity Selection Without Spell Hints

**User Story:** As a player, I want to select any monster and understand why I cannot cast on it yet, so that the disabled button is not confusing.

#### Acceptance Criteria

1. THE Necro_UI SHALL leave `suggestedSpell` as `null` on every displayed entity and SHALL make no call to `getSpellHint`.
2. THE Necro_UI SHALL allow the player to select every entity regardless of its `suggestedSpell` value.
3. WHILE the selected entity has `suggestedSpell` equal to `null`, THE Entity_Card SHALL disable the cast button.
4. WHILE the selected entity has `suggestedSpell` equal to `null`, THE Entity_Card SHALL display a short text stating that no spell is available for the entity.
5. WHILE the selected entity has `suggestedSpell` not equal to `null`, THE Entity_Card SHALL enable the cast button.

### Requirement 9: Entity Id Stability

**User Story:** As a player, I want entity identity to be handled correctly across undo, so that selection and animation state never point at a missing entity.

#### Acceptance Criteria

1. WHEN the implementation task starts, THE Implementer SHALL compare the Entity_Id set of the Layout before a cast with the Entity_Id set after the matching undo.
2. IF the Entity_Id sets differ, THEN THE Implementer SHALL adjust the game state reducer so selection and entity state follow the new Entity_Ids.
3. THE Final_Report SHALL state whether the Entity_Id sets were stable and which reducer change, if any, was made.

### Requirement 10: Real Engine Integration Test

**User Story:** As a maintainer, I want an automated end-to-end check of the real engine, so that the cast and undo round trip is proven.

#### Acceptance Criteria

1. THE Integration_Test SHALL run the sequence `createNecroAdapter`, `loadSampleRepository`, `castSpell`, source changed check, `rollbackLastSpell`, byte-identical check.
2. THE Integration_Test SHALL build its own `MutationRequest` from the sample source returned by `getSourceText()` and from entity or room ranges.
3. THE Integration_Test SHALL run with no network access and no AWS call.
4. WHEN `castSpell` resolves, THE Integration_Test SHALL assert that `getSourceText()` for the target file differs from the original text.
5. WHEN `rollbackLastSpell` resolves, THE Integration_Test SHALL assert that `getSourceText()` for the target file equals the original text byte for byte.
6. THE Integration_Test SHALL serve as evidence for task TASK-NC-12.

### Requirement 11: Sample Dungeon Report

**User Story:** As a maintainer, I want a factual report, so that I can see what the real sample dungeon contains.

#### Acceptance Criteria

1. THE Final_Report SHALL state the room count of the initial Layout.
2. THE Final_Report SHALL state the entity count for each `EntityType` in the initial Layout.
3. THE Final_Report SHALL state the count of entities with `suggestedSpell` not equal to `null`.
4. THE Final_Report SHALL list the size in bytes of each build chunk.

### Requirement 12: Repository Rule Compliance

**User Story:** As a maintainer, I want the change to respect repository rules, so that boundaries and quality gates stay intact.

#### Acceptance Criteria

1. THE Necro_UI SHALL import the Adapter only through `./adapter`.
2. THE Necro_UI SHALL contain no use of the TypeScript type `any`.
3. THE Necro_UI SHALL keep each component file under 150 lines.
4. THE Necro_UI SHALL use group comments only.
5. THE Necro_UI SHALL contain no unused code, including unused mock imports.
6. WHERE a mock module is still used by a test, THE Necro_UI SHALL keep that mock module.
7. THE implementation SHALL leave `apps/necro-compiler-game/src/adapter.ts`, `packages/`, and all other apps unmodified.
8. THE implementation SHALL leave all changes uncommitted.

### Requirement 13: Verification Routine

**User Story:** As a maintainer, I want a fixed verification routine, so that completion is checked the same way each time.

#### Acceptance Criteria

1. WHEN implementation finishes, THE Implementer SHALL run the typecheck, the test suite, and the production build for the Necro_UI and report each result.
2. WHEN the production build runs, THE Implementer SHALL report the size of each output chunk.
3. WHEN implementation finishes, THE Implementer SHALL run `pnpm run lint:boundaries` and report zero violations.
4. WHEN implementation finishes, THE Implementer SHALL re-read every changed file.
5. WHEN implementation finishes, THE Implementer SHALL run `wc -l` on `src/App.tsx`, `src/hud/*`, and `src/spells/*` and report the line counts.
