# Requirements Document

## Introduction

This feature is a visual and performance polish of the Necro_Game (`apps/necro-compiler-game`). It fixes monster and pillar scale relative to room walls, adds gothic atmosphere (bloom, torches, embers, procedural stone floor, cold fog), adds a room-focus camera behaviour, adds a minimal HUD with a title, goal line and counters, and sets CPU-side performance budgets verified by Vitest for dungeons of up to 300 rooms.

Scope is limited to `apps/necro-compiler-game`. No file under `packages/` or `apps/infrashield-chaos` changes. UI code imports only from `./adapter` and `contracts`. The steering file `necro-dungeon-lore.md` applies: shaders live in `src/shaders/*.glsl`, scene code lives in `src/components/dungeon/`, components stay under 150 lines, comments are group comments only, and `any` is not used.

Assumptions:
- A Boss_Room is a room flagged as a boss room by the dungeon layout. The sample repository has 2 Boss_Rooms.
- Some monsters are spell-immune, so the Monster_Counter counts monsters alive and does not claim they are vulnerable.
- The Boss_Monster is the monster with the highest severity in its Boss_Room, with ties broken by the lowest entity identifier.
- "Purified" means a monster whose lifecycle state is purified.

## Glossary

- **Necro_Game**: The application in `apps/necro-compiler-game`.
- **Dungeon_Scene**: The Three.js scene, camera and render loop of the Necro_Game, implemented in `src/components/dungeon/`.
- **Scale_Function**: The single shared function that derives monster radius, boss radius and pillar dimensions from the wall height of a room.
- **Wall_Height**: The height of a room's walls in scene units.
- **Regular_Demon**: A monster of demon type that is not the Boss_Monster.
- **Boss_Room**: A room flagged as a boss room, as stated in the Introduction.
- **Boss_Monster**: The monster with the highest severity in a Boss_Room, with ties broken by the lowest entity identifier.
- **Initial_Camera**: The camera pose the Dungeon_Scene uses after the dungeon loads and before any user input.
- **Bloom_Pass**: A `UnrealBloomPass` imported from `three/examples/jsm`, part of the Dungeon_Scene post-processing chain.
- **Torch**: A visual flame at one corner of a Boss_Room, consisting of an emissive flame mesh that participates in the Bloom_Pass. A Torch is either a Lit_Torch or an Unlit_Torch.
- **Lit_Torch**: A Torch that is paired with a real `PointLight`.
- **Unlit_Torch**: A Torch that has no `PointLight` and emits light through its emissive material only.
- **Light_Budget**: The maximum of four real `PointLight` objects for the entire Dungeon_Scene.
- **Light_Allocation**: The deterministic assignment of the Light_Budget to Boss_Rooms, evaluated in ascending room identifier order.
- **Ember_Field**: A single `Points` or `InstancedMesh` object rendering floating dust and ember particles.
- **Stone_Floor**: The dark floor surface shaded by a procedural stone shader whose source is in `src/shaders/*.glsl`.
- **Fog**: The cold-coloured scene fog of the Dungeon_Scene.
- **Reduced_Motion**: The state in which the media query `prefers-reduced-motion: reduce` matches.
- **Camera_Controller**: The Dungeon_Scene module that moves the camera between the whole-dungeon view and a room-focus view.
- **Whole_Dungeon_View**: A camera pose from which every room of the dungeon is inside the view frustum.
- **Room_Focus_View**: A camera pose from which the whole of one room is inside the view frustum.
- **HUD**: The heads-up display overlay of the Necro_Game.
- **Monster_Counter**: The HUD element showing "Monsters X / Y", where X is the number of monsters still alive and Y is the total number of monsters at load.
- **Purified_Counter**: The HUD element showing the number of purified monsters.
- **Frame_Loop**: The single `requestAnimationFrame` loop that updates and renders the Dungeon_Scene.
- **Perf_Suite**: The Vitest test files that assert CPU-side performance budgets.
- **Large_Layout**: A generated dungeon layout of 300 rooms.
- **Draw_Call_Count**: The number of draw calls the Dungeon_Scene issues per frame, counted from scene objects (meshes, points and instanced meshes that are visible).

## Requirements

### Requirement 1: Proportional scale

**User Story:** As a player, I want monsters and pillars sized in proportion to the room walls, so that I can see and recognise every monster from the starting view.

#### Acceptance Criteria

1. THE Scale_Function SHALL derive every monster radius, boss radius and pillar dimension from the Wall_Height.
2. THE Dungeon_Scene SHALL obtain monster and pillar sizes only from the Scale_Function.
3. WHEN a Regular_Demon is placed in a room, THE Scale_Function SHALL return a monster height between 30% and 40% of the Wall_Height.
4. WHEN the Boss_Monster is placed, THE Scale_Function SHALL return a monster height greater than the Regular_Demon height for the same Wall_Height.
5. WHEN pillars are placed in a room, THE Scale_Function SHALL return pillar dimensions that scale linearly with the Wall_Height.
6. WHILE the camera is at the Initial_Camera pose, THE Dungeon_Scene SHALL keep every monster visible, with no wall occluding the monster from the camera.
7. WHEN entities are placed in a room, THE Necro_Game SHALL keep every entity inside the room bounds with no overlap between entities.
8. THE existing placement and no-overlap property-based tests in `src/entities/__tests__/entityPlacement.pbt.test.ts` SHALL pass after the change.

### Requirement 2: Gothic atmosphere

**User Story:** As a player, I want a dark, torch-lit gothic atmosphere, so that the dungeon feels haunted while staying readable.

#### Acceptance Criteria

1. THE Dungeon_Scene SHALL render through the Bloom_Pass imported from `three/examples/jsm`.
2. THE Necro_Game SHALL add no new package dependency for the Bloom_Pass.
3. THE Dungeon_Scene SHALL contain exactly four Torches at the four corners of every Boss_Room, each with an emissive flame mesh that participates in the Bloom_Pass.
4. THE Dungeon_Scene SHALL contain at most four `PointLight` objects at any time, regardless of the number of rooms.
5. THE Dungeon_Scene SHALL light every room other than a Boss_Room through emissive materials only.
6. WHEN the Dungeon_Scene allocates the Light_Budget, THE Dungeon_Scene SHALL evaluate Boss_Rooms in ascending room identifier order.
7. WHEN the dungeon has exactly one Boss_Room, THE Dungeon_Scene SHALL place one Lit_Torch at each of its four corners.
8. WHEN the dungeon has exactly two Boss_Rooms, THE Dungeon_Scene SHALL place two Lit_Torches at the back corners of each Boss_Room and SHALL make the two front corner Torches of each Boss_Room Unlit_Torches.
9. WHEN the dungeon has more than two Boss_Rooms, THE Dungeon_Scene SHALL place one Lit_Torch in each of the first four Boss_Rooms in ascending room identifier order and SHALL make every other Torch an Unlit_Torch.
10. WHILE Reduced_Motion is not active, THE Dungeon_Scene SHALL vary each Lit_Torch light intensity with a flicker cycle of at least 2 seconds and a variation of at most 25% of base intensity.
11. WHILE Reduced_Motion is not active, THE Dungeon_Scene SHALL vary each Unlit_Torch flame emissive intensity with a flicker cycle of at least 2 seconds and a variation of at most 25% of base emissive intensity.
12. THE Dungeon_Scene SHALL render dust and embers through exactly one Ember_Field object.
13. THE Stone_Floor SHALL use a procedural stone shader with sources in `src/shaders/*.glsl` and SHALL replace the purple grid floor.
14. THE Dungeon_Scene SHALL apply the Fog with a cold colour and a density at which the farthest room of the sample dungeon stays distinguishable from the background.
15. WHILE Reduced_Motion is active, THE Dungeon_Scene SHALL hold every Lit_Torch light intensity and every Unlit_Torch emissive intensity constant and SHALL hold Ember_Field particles at fixed positions.
16. WHEN the Dungeon_Scene unmounts, THE Dungeon_Scene SHALL dispose every geometry, material, texture, render target, light helper, post-processing pass and event listener it created.

### Requirement 3: Room-focus camera

**User Story:** As a player, I want the camera to frame a room when I select a monster, so that I can see the room context of the code smell.

#### Acceptance Criteria

1. WHEN the player selects a monster, THE Camera_Controller SHALL glide the camera to a Room_Focus_View of the room containing that monster.
2. WHEN the player presses the Escape key, THE Camera_Controller SHALL glide the camera to the Whole_Dungeon_View and clear the selection.
3. WHEN the player clicks empty space in the Dungeon_Scene, THE Camera_Controller SHALL glide the camera to the Whole_Dungeon_View and clear the selection.
4. WHILE Reduced_Motion is active, THE Camera_Controller SHALL move the camera to the target pose in a single frame.
5. WHEN the player gives manual camera input during a glide, THE Camera_Controller SHALL cancel the glide.

### Requirement 4: Minimal HUD

**User Story:** As a player, I want a small HUD that states the goal and my progress, so that I understand the game without the interface covering the dungeon.

#### Acceptance Criteria

1. THE HUD SHALL display the title "NECRO-COMPILER" at the top-left of the viewport in the Cinzel font.
2. THE HUD SHALL display the goal line "Exorcise code smells. Every spell edits real code."
3. THE Monster_Counter SHALL display "Monsters X / Y", where X is the number of monsters still alive and Y is the total number of monsters at load.
4. THE Purified_Counter SHALL display the number of purified monsters in an element separate from the Monster_Counter.
5. WHEN a monster is purified, THE HUD SHALL decrease X by one and increase the purified count by one in the same update.
6. WHEN a spell is rolled back and the monster returns to alive, THE HUD SHALL increase X by one and decrease the purified count by one in the same update.
7. THE HUD SHALL keep Y constant after load.
8. THE HUD SHALL import only from `./adapter` and `contracts`.

### Requirement 5: Performance budgets

**User Story:** As a player, I want the dungeon to run smoothly, so that the visuals do not cost playability, including for large repositories.

#### Acceptance Criteria

1. THE Dungeon_Scene SHALL update and render through one Frame_Loop.
2. THE Perf_Suite SHALL use time budgets loosened to approximately twice the target values, with the exact values decided in the design, so that the tests stay stable on varied hardware.
3. THE Perf_Suite SHALL assert Draw_Call_Count and `PointLight` count against the strict structural limits stated in this document, without loosening.
4. WHEN the Dungeon_Scene is built from the Large_Layout, THE Perf_Suite SHALL assert that entity placement completes within a fixed time budget defined in the test file.
5. WHEN the Scale_Function is evaluated for every entity of the Large_Layout, THE Perf_Suite SHALL assert that the evaluation completes within a fixed time budget defined in the test file.
6. WHEN one Frame_Loop tick runs on the Large_Layout, THE Perf_Suite SHALL assert that the CPU time of the tick stays within a per-frame budget defined in the test file.
7. WHEN the room count grows from the sample dungeon to the Large_Layout, THE Perf_Suite SHALL assert that the Draw_Call_Count stays equal to the Draw_Call_Count of the sample dungeon.
8. WHEN the room count grows from the sample dungeon to the Large_Layout, THE Perf_Suite SHALL assert that the number of `PointLight` objects stays at four or fewer.
9. THE Perf_Suite SHALL run under `pnpm test` in `apps/necro-compiler-game` without a standalone benchmark script.
10. THE Perf_Suite SHALL be a mandatory part of the feature and every performance test SHALL be implemented.

### Requirement 6: Repository constraints

**User Story:** As a maintainer, I want the change to respect repository rules, so that the app stays maintainable and isolated from the core.

#### Acceptance Criteria

1. THE Necro_Game SHALL contain no file edit outside `apps/necro-compiler-game` and `.kiro/specs/necro-visual-polish` for this feature.
2. THE Necro_Game SHALL keep every React component file under 150 lines.
3. THE Necro_Game SHALL use group comments only, with no per-line comments.
4. THE Necro_Game SHALL contain no use of the TypeScript type `any`.
5. THE Necro_Game SHALL contain no unused code introduced by this feature.
6. THE Necro_Game SHALL import from `packages/morpheus-ast-core` only through `./adapter` and `contracts`.
7. WHEN the feature is complete, THE commands `pnpm run typecheck`, `pnpm test` and `pnpm run build` in `apps/necro-compiler-game` SHALL exit with status 0 and the build report SHALL state the largest chunk size.
8. WHEN the feature is complete, THE command `pnpm run lint:boundaries` at the repository root SHALL exit with status 0.
9. THE Necro_Game SHALL include every property-based test and every performance test defined for this feature as a mandatory deliverable, with no test task marked optional.
