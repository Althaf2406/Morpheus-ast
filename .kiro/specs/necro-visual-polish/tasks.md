# Implementation Plan: Necro Visual Polish

## Overview

Language: TypeScript (strict, no `any`). All work stays inside `apps/necro-compiler-game` and this spec folder. No edits to `packages/` or `apps/infrashield-chaos`, and no commits. Paths are relative to `apps/necro-compiler-game/` unless stated. Order: shared scale function and boss rule, atmosphere (torch allocation, torches, embers, stone floor, bloom, GridHelper removal), camera, HUD, performance suite, checkpoint, final verification.

Every test task, property test and performance test, is mandatory. No task is marked optional.

## Tasks

- [x] 1. Proportional scale and boss rule
  - [x] 1.1 Create `src/entities/scale.ts`
    - Export `ScaleResult`, `REGULAR_MONSTER_FRACTION` (0.35), `BOSS_MONSTER_FRACTION` (0.52), `PILLAR_HEIGHT_FACTOR`, `PILLAR_GIRTH_FACTOR`, `wallHeightFor(extent)` (takes over the 0.3 fraction from `roomParts.ts`), `scaleFor(wallHeight)` and `monsterRadius(wallHeight, isBoss, severityScale)`
    - Export `bossMonsterId(entities)`: highest severity wins, ties go to the lowest entity id, `null` for an empty room
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 1.2 Route monster and pillar sizes through the Scale_Function
    - `roomParts.ts`: `pillarBoxes` uses `scaleFor(wallHeight)` and drops `BOSS_PILLAR_BOOST` and its own wall-height constant
    - `monsterConfig.ts`: expose a relative `severityScale` (INFO 0.8 to CRITICAL 1.3), keep `SEVERITY_VISUAL` only for intensity, remove `entityRadius` and stop applying `sizeScale` to radius
    - `entityPlacement.ts`: `placeRoomEntities` gains an `isBossRoom` parameter, computes `isBoss = isBossRoom && entityId === bossMonsterId(entities)`, calls `monsterRadius`, and still clamps to `maxRadius`
    - Update every caller (`EntityLayer.tsx`, `DungeonRooms.tsx` and others) to pass `room.size === "BOSS"`
    - Update existing tests that referenced removed symbols
    - Keep the Initial_Camera view free of occluding walls
    - _Requirements: 1.2, 1.6, 1.7, 1.8, 6.5_

  - [x] 1.3 Write property test for regular monster height band
    - File `src/entities/__tests__/scaleBand.pbt.test.ts`
    - **Property 1: Regular monster height stays within the mandated band**
    - **Validates: Requirements 1.3**

  - [x] 1.4 Write property test for boss versus regular height
    - File `src/entities/__tests__/scaleBoss.pbt.test.ts`
    - **Property 2: Boss monster is always taller than a regular monster at the same wall height**
    - **Validates: Requirements 1.4**

  - [x] 1.5 Write property test for linear pillar scaling
    - File `src/entities/__tests__/scaleLinear.pbt.test.ts`
    - **Property 3: Pillar dimensions scale linearly with wall height**
    - **Validates: Requirements 1.5**

  - [x] 1.6 Write property test that Scale_Function is the only size source
    - File `src/entities/__tests__/scaleSource.pbt.test.ts`
    - **Property 4: Scale_Function is the only source of monster and pillar size**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 1.7 Write property test for Boss_Monster selection
    - File `src/entities/__tests__/bossMonster.pbt.test.ts`
    - Cover the highest-severity and lowest-id tie-break rule, and that a room that is not a Boss_Room never receives the boss radius
    - **Property 5: Boss_Monster is the highest-severity entity, ties to the lowest id**
    - **Validates: Requirements 1.4**

  - [x] 1.8 Extend placement tests as regression and add scale unit tests
    - Update `src/entities/__tests__/entityPlacement.pbt.test.ts` and `monsterConfig.pbt.test.ts` for the new radius source and the `isBossRoom` parameter
    - Add unit tests in `src/entities/__tests__/scale.test.ts` for `scaleFor` and `monsterRadius` at fixed wall heights, and for `bossMonsterId` on an empty room and on `room-002` of the sample dungeon
    - **Property 6: Entities stay inside room bounds without overlap (regression)**
    - **Validates: Requirements 1.7, 1.8**

- [x] 2. Gothic atmosphere
  - [x] 2.1 Create `src/components/dungeon/torchAllocation.ts`
    - Export `TorchCorner`, `TorchSlot`, `LIGHT_BUDGET` (4), `bossRoomsOf(layout)` (rooms with `size === "BOSS"`), `allocateTorches(bossRoomIds)`, `torchCorners(origin, extent)` and `flickerFactor(time, seed, reducedMotion)`
    - `allocateTorches` sorts ids by code-unit order and de-duplicates them. One room: four lit slots. Two rooms: back corners lit, front corners unlit. More than two rooms: back-left lit only for the first four ids. No rooms: empty list
    - `flickerFactor` returns 1 under Reduced_Motion, otherwise `1 + 0.25 * sin(2π * time / period + phase)` with `period = 2.4 + 0.8 * seed`
    - _Requirements: 2.3, 2.4, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11_

  - [x] 2.2 Create `src/components/dungeon/torches.ts`
    - Build one flame `InstancedMesh` for all Torches (four instances per Boss_Room, count 0 with no Boss_Room) with a `MeshBasicMaterial` whose instance colour is scaled above 1 for the Bloom_Pass
    - Create one `PointLight` per lit slot, positioned at its flame, and none for non-boss rooms
    - Export a tick that multiplies Lit_Torch light intensity and flame colour, and Unlit_Torch flame colour only, by `flickerFactor`; under Reduced_Motion write base values once and register no tick
    - Export a dispose function for flame geometry, material and instance buffers, and remove the lights from the scene
    - _Requirements: 2.3, 2.4, 2.5, 2.10, 2.11, 2.15, 2.16_

  - [x] 2.3 Create `src/components/dungeon/emberField.ts`
    - `createEmberField(scene, bounds)` returns one `THREE.Points` with a fixed particle count (about 400), a drift tick function and a dispose function
    - _Requirements: 2.12, 2.15, 2.16_

  - [x] 2.4 Add the procedural Stone_Floor
    - Create `src/shaders/stoneFloor.vert.glsl` and `stoneFloor.frag.glsl` reusing `common.glsl` and `noise.glsl`
    - Export the sources from `src/shaders/index.ts`
    - `DungeonRooms.tsx`: use a `ShaderMaterial` for the floor instanced mesh only (walls and pillars keep their stone material) and dispose it in effect cleanup
    - _Requirements: 2.13, 2.16, 6.2_

  - [x] 2.5 Remove the GridHelper
    - `dungeonLighting.ts`: delete the `GridHelper` and the `grid` field of `LightingRig`
    - Update every reference to `grid` in `dungeonRig.ts` and elsewhere
    - _Requirements: 2.13, 6.5_

  - [x] 2.6 Create `AtmosphereLayer.tsx` and wire it into `DungeonScene.tsx`
    - `AtmosphereLayer` owns torches (from `allocateTorches(bossRoomsOf(layout) ids)`) and the ember field, and exposes one combined tick registered through `useTickRegistry` (new `handleAtmosphereTick` slot)
    - Under Reduced_Motion create the ember field and torches but register no tick
    - Dispose torches, ember geometry and material on unmount
    - Keep each file under 150 lines
    - _Requirements: 2.3, 2.4, 2.12, 2.15, 2.16, 5.1_

  - [x] 2.7 Add Bloom_Pass and cold fog in `dungeonRig.ts`
    - Add `EffectComposer`, `RenderPass`, `UnrealBloomPass` from `three/examples/jsm/postprocessing/*` (no new dependency)
    - Replace `renderer.render` with `composer.render()` inside the existing single loop; call `composer.setSize` in the resize observer
    - Set fog colour to a cold tone (about `0x1a2230`), keep the existing near/far ratios
    - Extend `dispose()` for the composer, passes and render targets
    - _Requirements: 2.1, 2.2, 2.14, 2.16, 5.1_

  - [x] 2.8 Write property test for Boss_Room identification
    - File `src/components/dungeon/__tests__/bossRooms.pbt.test.ts`
    - **Property 7: Boss_Room identification matches the layout rule**
    - **Validates: Requirements 2.3, 2.6**

  - [x] 2.9 Write property test for four torches per Boss_Room
    - File `src/components/dungeon/__tests__/torchCount.pbt.test.ts`
    - **Property 8: Every Boss_Room gets exactly four torches**
    - **Validates: Requirements 2.3**

  - [x] 2.10 Write property test for light allocation
    - File `src/components/dungeon/__tests__/torchLights.pbt.test.ts`
    - **Property 9: Light allocation follows the room-count rule and the budget**
    - **Validates: Requirements 2.4, 2.7, 2.8, 2.9**

  - [x] 2.11 Write property test for allocation determinism
    - File `src/components/dungeon/__tests__/torchOrder.pbt.test.ts`
    - **Property 10: Allocation is deterministic and independent of input order**
    - **Validates: Requirements 2.6**

  - [x] 2.12 Write property test for scene PointLight count
    - File `src/components/dungeon/__tests__/torchScene.pbt.test.ts`
    - **Property 11: Scene PointLight count equals the lit allocation and never exceeds four**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 2.13 Write property test for torch flicker bounds
    - File `src/components/dungeon/__tests__/torchFlicker.pbt.test.ts`
    - **Property 12: Torch flicker stays within bounds when motion is not reduced**
    - **Validates: Requirements 2.10, 2.11**

  - [x] 2.14 Write property test for reduced-motion atmosphere
    - File `src/components/dungeon/__tests__/atmosphereReduced.pbt.test.ts`
    - **Property 13: Reduced motion freezes atmosphere animation**
    - **Validates: Requirements 2.15**

  - [x] 2.15 Write property test for the single Ember_Field
    - File `src/components/dungeon/__tests__/emberSingle.pbt.test.ts`
    - **Property 14: Scene has exactly one Ember_Field**
    - **Validates: Requirements 2.12**

  - [x] 2.16 Write property test for disposal
    - File `src/components/dungeon/__tests__/atmosphereDispose.pbt.test.ts`
    - **Property 15: Dungeon_Scene disposal releases every created resource**
    - **Validates: Requirements 2.16**

  - [x] 2.17 Write unit tests for atmosphere edge cases
    - `allocateTorches([])` returns an empty list and the flame mesh has count 0 with no `PointLight`
    - `allocateTorches(["room-002", "room-001"])` lists `room-001` first with two lit back corners per room; `bossRoomsOf(mockDungeonLayout)` returns `room-001` and `room-002` and matches `bossRoomIds`
    - Stone shader sources are non-empty, the floor material is a `ShaderMaterial`, and no `GridHelper` remains in the scene
    - _Requirements: 2.3, 2.6, 2.13_

- [x] 3. Room-focus camera
  - [x] 3.1 Add `reset()` to `cameraGlide.ts`
    - Glide to the Whole_Dungeon_View computed once from `frameCamera(positions)`; reduced motion snaps in one frame; manual "start" input cancels the glide
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Wire selection clearing in `DungeonInteraction.tsx`
    - When `selectedEntityId` becomes null (Escape or empty-space click) call `glideRef.current?.reset()`
    - Keep the file under 150 lines
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.3 Write property test for focus target
    - File `src/components/dungeon/__tests__/cameraFocus.pbt.test.ts`
    - **Property 16: Selecting a monster glides the camera to its room**
    - **Validates: Requirements 3.1**

  - [x] 3.4 Write property test for reset target
    - File `src/components/dungeon/__tests__/cameraReset.pbt.test.ts`
    - **Property 17: Clearing selection returns to the Whole_Dungeon_View**
    - **Validates: Requirements 3.2, 3.3**

  - [x] 3.5 Write property test for reduced-motion glide
    - File `src/components/dungeon/__tests__/cameraGlideReduced.pbt.test.ts`
    - **Property 18: Reduced motion makes camera glides instantaneous**
    - **Validates: Requirements 3.4**

  - [x] 3.6 Write property test for glide cancellation
    - File `src/components/dungeon/__tests__/cameraGlideCancel.pbt.test.ts`
    - **Property 19: Manual input cancels an in-progress glide**
    - **Validates: Requirements 3.5**

- [x] 4. Minimal HUD
  - [x] 4.1 Create `src/hud/HudTitle.tsx` and `src/hud/CounterBar.tsx`
    - `HudTitle`: "NECRO-COMPILER" in Cinzel at top-left plus the goal line "Exorcise code smells. Every spell edits real code."
    - `CounterBar`: props `aliveCount`, `totalCount`, `purifiedCount`; renders "Monsters X / Y" and a separate purified-count element; the word "Vulnerable" does not appear
    - Presentational, primitive props only, no engine imports
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8_

  - [x] 4.2 Derive counters and mount the HUD in `App.tsx`
    - Y from `layout.rooms` entity total (memoised); purified count from `state.states` entries equal to `PURIFIED`; X = Y − purified, both from the same render so they change together; a dying monster still counts as alive
    - Keep `App.tsx` under 150 lines (extract a small helper if needed)
    - _Requirements: 4.3, 4.5, 4.6, 4.7_

  - [x] 4.3 Write property test for counters
    - File `src/hud/__tests__/counterBar.pbt.test.ts`
    - **Property 20: Monster_Counter and Purified_Counter move together and sum correctly**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7**

  - [x] 4.4 Write unit tests for HUD text
    - `HudTitle` and `CounterBar` render the expected text, including exactly `Monsters 6 / 6`, following `src/hud/__tests__` conventions
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Performance suite
  - [x] 5.1 Create perf fixtures and helpers
    - `src/perf/largeLayout.ts`: generate a 300-room `DungeonLayout` with several Boss_Rooms (so the more-than-two branch runs), reusing shapes from `mock/dungeonLayout.ts`; also export a generator taking a room count
    - `src/perf/countDrawCalls.ts`: traverse a scene counting visible `Mesh`, `Points` and `InstancedMesh` objects (not per instance) and return `DrawCallCount`
    - `src/perf/measure.ts`: `medianOfFive(fn)` runs one warm-up call, then five measured runs with `performance.now()`, and returns the median in ms
    - _Requirements: 5.2, 5.4, 5.7_

  - [x] 5.2 Create the scene builder fixture `src/perf/buildPerfScene.ts`
    - Build a `THREE.Scene` from a layout by calling the room, corridor, entity, torch and ember builder functions directly (no React, no renderer, no composer)
    - _Requirements: 5.3, 5.6, 5.7, 5.8_

  - [x] 5.3 Write perf test for entity placement
    - File `src/perf/__tests__/placement.perf.test.ts`; `placeRoomEntities` over all rooms of Large_Layout, median of 5 after warm-up, budget 100 ms
    - **Property 21: Entity placement stays within the Large_Layout time budget**
    - **Validates: Requirements 5.2, 5.4**

  - [x] 5.4 Write perf test for Scale_Function
    - File `src/perf/__tests__/scale.perf.test.ts`; `scaleFor` and `monsterRadius` for every entity of Large_Layout, median of 5 after warm-up, budget 30 ms
    - **Property 22: Scale_Function evaluation stays within the Large_Layout time budget**
    - **Validates: Requirements 5.2, 5.5**

  - [x] 5.5 Write perf test for one Frame_Loop tick
    - File `src/perf/__tests__/frameTick.perf.test.ts`; one tick of entity driver, camera glide, torch and ember on Large_Layout, median of 5 after warm-up, budget 16 ms, no render call
    - **Property 23: One Frame_Loop tick stays within the per-frame time budget**
    - **Validates: Requirements 5.2, 5.6**

  - [x] 5.6 Write test for Draw_Call_Count stability
    - File `src/perf/__tests__/drawCalls.perf.test.ts`; strict `===` against the sample dungeon count captured at test time, over generated layouts from the sample size up to 300 rooms, each with at least one Boss_Room
    - **Property 24: Draw_Call_Count does not grow with room count**
    - **Validates: Requirements 5.3, 5.7**

  - [x] 5.7 Write test for PointLight count
    - File `src/perf/__tests__/lightCount.perf.test.ts`; `toBeLessThanOrEqual(4)` over generated layouts from the sample size up to 300 rooms
    - **Property 25: PointLight count never exceeds four as room count grows**
    - **Validates: Requirements 5.3, 5.8**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Final verification
  - [x] 7.1 Run typecheck
    - `pnpm run typecheck` in `apps/necro-compiler-game` exits 0; fix any errors
    - _Requirements: 6.4, 6.7_

  - [x] 7.2 Run tests
    - `pnpm test` in `apps/necro-compiler-game` exits 0, including every property test and the full Perf_Suite
    - _Requirements: 5.9, 5.10, 6.7, 6.9_

  - [x] 7.3 Run build and report chunk size
    - `pnpm run build` in `apps/necro-compiler-game` exits 0; report the largest chunk size from the build output
    - _Requirements: 6.7_

  - [x] 7.4 Run boundary lint
    - `pnpm run lint:boundaries` at the repository root exits 0 with zero violations
    - _Requirements: 6.6, 6.8_

  - [x] 7.5 Re-read every changed file
    - List changed files with `git status --short` (no commits); confirm none sit outside `apps/necro-compiler-game` and `.kiro/specs/necro-visual-polish`, and none under `packages/` or `apps/infrashield-chaos`
    - Re-read each changed file for group-comments-only, no `any`, no unused code, and correct imports
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.6 Check line counts of changed files
    - Run `wc -l` on every changed or new file; each React component file must be under 150 lines, and `scale.ts`, `torchAllocation.ts`, `torches.ts`, `emberField.ts` and `dungeonLighting.ts` are kept under 150 too
    - _Requirements: 6.2_

## Notes

- Every test task is mandatory. No sub-task carries an optional marker
- Do not commit and do not edit `packages/` or `apps/infrashield-chaos`
- Each task references specific requirements for traceability
- Property tests use fast-check with at least 100 iterations and the tag `**Feature: necro-visual-polish, Property N: ...**`
- Perf timing tests use one warm-up call and the median of five runs; Draw_Call_Count and PointLight assertions are strict
- Tasks that edit the same file are placed in different waves

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "2.4", "2.5", "3.1", "4.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "2.2", "2.7", "2.8", "2.9", "2.10", "2.11", "2.13", "3.2", "4.2"] },
    { "id": 2, "tasks": ["1.6", "1.7", "1.8", "2.6", "2.12", "2.14", "3.3", "3.4", "3.5", "3.6", "4.3", "4.4", "5.3", "5.4"] },
    { "id": 3, "tasks": ["2.15", "2.16", "2.17", "5.2"] },
    { "id": 4, "tasks": ["5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["7.3"] },
    { "id": 9, "tasks": ["7.4"] },
    { "id": 10, "tasks": ["7.5"] },
    { "id": 11, "tasks": ["7.6"] }
  ]
}
```
