# Design Document

## Overview

This design fixes monster/pillar scale, adds gothic atmosphere, adds a room-focus camera, adds a minimal HUD, and sets CPU-side performance budgets for the Necro_Game at `apps/necro-compiler-game`. All work stays inside that app plus this spec folder. No change touches `packages/` or `apps/infrashield-chaos`. The HUD imports only from `./adapter` and `contracts`-equivalent app types; the Dungeon_Scene keeps its existing layering (`DungeonScene` → `DungeonRooms` / `DungeonCorridors` / `EntityLayer` / `DungeonInteraction`) and its single render loop in `dungeonRig.ts`.

The plan reuses existing seams rather than adding new architecture:

- **Scale_Function**: a new pure module `src/entities/scale.ts`, consumed by both `roomParts.ts` (pillars) and `entityPlacement.ts` / `monsterConfig.ts` (monsters), replacing the independent constants (`WALL_HEIGHT_FRACTION`, `BOSS_PILLAR_BOOST`, `SEVERITY_VISUAL` radii) that currently derive size from room extent/severity without reference to each other.
- **Single rAF loop**: already exists in `dungeonRig.ts` (`render()` calls `onFrame`, `controls.update()`, `renderer.render()`). No second loop is added. The Bloom_Pass swaps `renderer.render(scene, camera)` for `composer.render()` inside that same loop. Torch flicker, ember drift and camera glide register through the existing `useTickRegistry` map rather than starting their own `requestAnimationFrame`.
- **Boss_Room rule**: one pure helper, `bossRoomsOf(layout)` in `src/components/dungeon/torchAllocation.ts`, selects rooms whose `size === "BOSS"`. This is the rule the existing code already uses (see "Boss_Room identification").
- **Torch allocation**: one pure function, `allocateTorches(bossRoomIds)`, decides which of the four corner Torches of each Boss_Room is a Lit_Torch. The scene builder only consumes its result.
- **HUD**: new presentational components under `src/hud/`, fed by counters derived from `state.states` (already in `SpellState`) in `App.tsx`. No adapter change.

## Architecture

```
App.tsx
 ├─ DungeonScene.tsx           (unchanged structure; passes bloom + reducedMotion down)
 │   ├─ dungeonRig.ts          (renderer, camera, controls, EffectComposer, ONE rAF loop)
 │   │   └─ dungeonLighting.ts (ambient/hemi/dir kept; GridHelper removed)
 │   ├─ torchAllocation.ts     (new, pure: bossRoomsOf, allocateTorches, torchCorners, flickerFactor)
 │   ├─ torches.ts             (new: lights + one flame InstancedMesh, tick, dispose)
 │   ├─ emberField.ts          (new: one Points object)
 │   ├─ DungeonRooms.tsx       (stone shader floor via roomParts + new stoneFloor material)
 │   ├─ DungeonCorridors.tsx   (unchanged)
 │   ├─ EntityLayer.tsx        (now sources radius from scale.ts via entityPlacement.ts)
 │   └─ DungeonInteraction.tsx (cameraGlide.ts: focus/clear on select/Escape/empty click)
 ├─ HUD
 │   ├─ hud/HudTitle.tsx       (new: title + goal line)
 │   ├─ hud/CounterBar.tsx     (new: Monster_Counter + Purified_Counter)
 │   ├─ hud/Grimoire.tsx       (unchanged)
 │   └─ hud/SpellBar.tsx       (unchanged)
 └─ entities/scale.ts          (new: Scale_Function, single source of monster/pillar size)
```

### Component size budget

Every file above stays under 150 lines (Requirement 6.2). `scale.ts` is pure data/math (~40 lines). The new HUD components are small (title ~20 lines, counters ~35 lines). Torch and ember code live in new siblings (`torchAllocation.ts` ~90 lines, `torches.ts` ~120 lines, `emberField.ts` ~70 lines) instead of growing `dungeonLighting.ts`.

## Components and Interfaces

### 1. Scale_Function — `src/entities/scale.ts`

```typescript
export interface ScaleResult {
  readonly regularMonsterHeight: number;
  readonly bossMonsterHeight: number;
  readonly pillarGirth: number;
  readonly pillarHeight: number;
}

/** Fraction of Wall_Height a Regular_Demon occupies. Kept inside [0.30, 0.40]. */
export const REGULAR_MONSTER_FRACTION = 0.35;
export const BOSS_MONSTER_FRACTION = 0.52;
export const PILLAR_HEIGHT_FACTOR = 1.0;
export const PILLAR_GIRTH_FACTOR = 0.09;

/** Single source of monster and pillar size: everything derives from Wall_Height. */
export function scaleFor(wallHeight: number): ScaleResult {
  return {
    regularMonsterHeight: wallHeight * REGULAR_MONSTER_FRACTION,
    bossMonsterHeight: wallHeight * BOSS_MONSTER_FRACTION,
    pillarHeight: wallHeight * PILLAR_HEIGHT_FACTOR,
    pillarGirth: wallHeight * PILLAR_GIRTH_FACTOR,
  };
}

/** Per-entity radius: severity still modulates size, but within the Scale_Function envelope. */
export function monsterRadius(wallHeight: number, isBoss: boolean, severityScale: number): number {
  const height = isBoss ? scaleFor(wallHeight).bossMonsterHeight : scaleFor(wallHeight).regularMonsterHeight;
  return (height / 2) * severityScale;
}
```

`wallHeight` comes from `wallHeightFor(extent)` in `scale.ts` (`extent[1] * WALL_HEIGHT_FRACTION`, with the 0.3 fraction moved there from `roomParts.ts`). `roomParts.pillarBoxes` calls `scaleFor(wallHeight).pillarHeight/pillarGirth` instead of its own `BOSS_PILLAR_BOOST` constant. `entityPlacement.placeRoomEntities` calls `monsterRadius(wallHeight, isBoss, severityScale)` instead of `entityRadius` in `monsterConfig.ts`; `monsterConfig.ts` keeps `SEVERITY_VISUAL` only for `intensity`, and exposes a `severityScale` (relative multiplier, e.g. `INFO=0.8 … CRITICAL=1.3`) consumed by `scale.ts`. This satisfies Requirement 1.2 (Dungeon_Scene obtains sizes only from Scale_Function) while keeping severity variation (Requirement 1 existing PBTs on monotonicity).

**Boss_Monster rule.** `scale.ts` also exports `bossMonsterId(entities)`, which returns the id of the entity with the highest severity, ties broken by the lowest entity id, or `null` for an empty room. `placeRoomEntities` gains a boolean parameter `isBossRoom` and passes `isBoss = isBossRoom && entity.entityId === bossMonsterId(entities)` to `monsterRadius`. The current code decides boss size from `type === "POLTERGEIST_DEMON_BOSS"` (via `MONSTER_CONFIG.sizeScale`). That differs from the requirement: in the sample dungeon `room-002` holds a single HIGH `POLTERGEIST_DEMON`, which is its Boss_Monster by severity, and a CRITICAL entity outside a Boss_Room is a Regular_Demon. `entityRadius` no longer applies `sizeScale`; `sizeScale` stays in `MONSTER_CONFIG` only for shader and mesh-fill use.

`entityPlacement.ts` still clamps the returned radius to `maxRadius` (half-cell, Requirement 1.7/1.8), so Scale_Function values are a target, not a hard violation of placement bounds — satisfying both the 30–40% rule (loose rooms) and the existing no-overlap property.

### 2. Gothic atmosphere

**Bloom** — `dungeonRig.ts` adds an `EffectComposer` with `RenderPass` + `UnrealBloomPass` from `three/examples/jsm/postprocessing/*`, already reachable because `OrbitControls` is imported the same way (Requirement 2.2: no new dependency). `render()` calls `composer.render()` instead of `renderer.render(scene, camera)`; the `ResizeObserver` callback also calls `composer.setSize`. `dispose()` disposes the composer's render targets and passes.

**Boss_Room identification.** Read from the app source: `adapter.ts` derives `RoomSize` from cyclomatic complexity (`>= 15` gives `"BOSS"`) and builds `DungeonLayout.bossRoomIds` as `rooms.filter(r => r.size === "BOSS").map(r => r.id)`. `DungeonRooms.tsx` already treats a room as boss with `room.size === "BOSS"` when calling `buildRoomParts(..., isBoss)`. The sample (`mock/dungeonLayout.ts`) has 12 rooms, two of them BOSS (`room-001` complexity 18, `room-002` complexity 16), and `bossRoomIds: ["room-001", "room-002"]`. The design uses `room.size === "BOSS"` (equivalently, membership in `bossRoomIds`). `bossRoomIds` follows layout order, which is not guaranteed to be sorted, so the allocation sorts by id itself.

**Torch allocation (pure)** — `torchAllocation.ts`:

```typescript
export type TorchCorner = "BACK_LEFT" | "BACK_RIGHT" | "FRONT_LEFT" | "FRONT_RIGHT";
export interface TorchSlot { readonly roomId: string; readonly corner: TorchCorner; readonly lit: boolean; }
export const LIGHT_BUDGET = 4;

export function bossRoomsOf(layout: DungeonLayout): readonly DungeonRoom[] {
  return layout.rooms.filter((room) => room.size === "BOSS");
}

/** Deterministic: sorted by room id (code-unit order), duplicates removed, input order ignored. */
export function allocateTorches(bossRoomIds: readonly string[]): readonly TorchSlot[] {
  const ids = [...new Set(bossRoomIds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return ids.flatMap((roomId, index) => CORNERS.map((corner) => ({ roomId, corner, lit: isLit(ids.length, index, corner) })));
}
```

`isLit(count, index, corner)`: `count === 1` gives all four corners lit; `count === 2` gives `BACK_LEFT` and `BACK_RIGHT` lit; `count > 2` gives `BACK_LEFT` lit only when `index < LIGHT_BUDGET`. Every other slot is unlit. Lit slots total 4 for one or two Boss_Rooms, `min(count, 4)` for three or more, and 0 for none. "Back" is the `-z` side, away from the default camera, which sits at `+z` (`frameCamera`). `torchCorners(origin, extent)` returns the four world positions, inset from the room corners by the pillar girth and at 0.75 of the wall height, so that flames sit beside the corner pillars.

**Torch scene objects** — `torches.ts` builds, from `allocateTorches(...)`:
- One `InstancedMesh` of flame geometry for every Torch of every Boss_Room (4 instances per Boss_Room), with a `MeshBasicMaterial` whose instance colour is scaled above 1 so the Bloom_Pass picks it up. A single instanced object keeps the Draw_Call_Count independent of the number of Boss_Rooms. The mesh is always added (count 0 when there is no Boss_Room).
- One `PointLight` per slot where `lit` is true, positioned at the slot's flame, so the scene holds at most `LIGHT_BUDGET` lights.
- Non-boss rooms get no light and no torch; they use emissive materials only (Requirement 2.5).

**Flicker** — `flickerFactor(time, seed, reducedMotion)` is pure: it returns `1` when `reducedMotion` is true, otherwise `1 + 0.25 * sin(2π * time / period + phase)` with `period = 2.4 + 0.8 * seed` seconds (at least 2 s) and `phase = 2π * seed`, so the factor stays in `[0.75, 1.25]`. A Lit_Torch multiplies its light intensity and its flame instance colour by the factor; an Unlit_Torch multiplies only its flame instance colour (emissive intensity). The tick is registered through `useTickRegistry`, never a separate loop. Under Reduced_Motion the tick is not registered and base values are written once.

**Ember_Field** — new `src/components/dungeon/emberField.ts` exporting `createEmberField(scene, bounds)` returning one `THREE.Points` object with a `BufferGeometry` of a fixed particle count (e.g. 400), drifting via a tick function registered on `useTickRegistry`. Under Reduced_Motion the field is still created but its tick is never registered (positions stay fixed), satisfying Requirement 2.15.

**Stone_Floor** — new `src/shaders/stoneFloor.vert.glsl` and `src/shaders/stoneFloor.frag.glsl`, assembled in `shaders/index.ts` alongside the existing monster shaders (reusing `common.glsl`/`noise.glsl`). `DungeonRooms.tsx` swaps the floor's `MeshStandardMaterial` for a `ShaderMaterial` using these sources for the `floor` instanced mesh only (walls/pillars keep their stone `MeshStandardMaterial`, satisfying Requirement 2.13). The purple grid is the `GridHelper` in `dungeonLighting.ts` (colours `0x332244`/`0x221133`); it is removed, along with the `grid` field of `LightingRig`.

**Fog** — already `THREE.Fog` in `dungeonRig.ts`, scaled to `frame.camDist`. Change color to a cold tone (e.g. `0x1a2230`) and keep the existing near/far ratios (`camDist * 0.8` / `camDist * 3`), which already keep the farthest room distinguishable because `frame.camDist` grows with layout size (Requirement 2.14).

**Disposal** — `dungeonRig.dispose()` extends to dispose the composer, bloom pass, the flame `InstancedMesh` geometry, material and instance buffers, and the ember field's geometry/material. `PointLight`s hold no GPU resources, so they are only removed from the scene; `DungeonRooms.tsx`'s effect cleanup disposes the new stone shader material (Requirement 2.16).

### 3. Room-focus camera

`cameraGlide.ts` already implements glide-to-target, reduced-motion snap, and cancel-on-manual-input (Requirements 3.1, 3.4, 3.5) and is wired from `DungeonInteraction.tsx` on selection change. Two gaps close this feature:

- **Escape / empty click → Whole_Dungeon_View**: `DungeonInteraction.tsx`'s `onSelect(null)` path (already triggered by `monsterPicker`'s empty-space click, and by `useSpellKeys`'s `onCancel` via `App.tsx`'s `select(null)`) must glide to the Whole_Dungeon_View, not just hide the halo. `cameraGlide.ts` gains a second target, `CameraGlide.reset()`, computed once from `frameCamera(positions)` (same function `dungeonRig.ts` already calls) and stored in `DungeonInteraction`'s glide-setup effect. The `selectedEntityId === null` effect calls `glideRef.current?.reset()` instead of doing nothing (Requirements 3.2, 3.3).
- **Room_Focus_View correctness**: unchanged from today's `glide.focus(origin...)` call, which already derives the target from the selected monster's room.

### 4. Minimal HUD

Two new components, both pure/presentational, reading only props:

```typescript
// src/hud/HudTitle.tsx
interface Props { readonly goalLine: string; }
export function HudTitle({ goalLine }: Props) { /* title + goal line, top-left, Cinzel */ }
```

```typescript
// src/hud/CounterBar.tsx
interface Props {
  readonly aliveCount: number;
  readonly totalCount: number;
  readonly purifiedCount: number;
}
export function CounterBar({ aliveCount, totalCount, purifiedCount }: Props) { /* "Monsters X / Y" in Monster_Counter, purified count in a separate Purified_Counter element */ }
```

`App.tsx`'s `Dungeon` component computes counters from existing data without adapter changes:

```typescript
const total = useMemo(
  () => layout.rooms.reduce((n, r) => n + r.entities.length, 0),
  [layout]
); // Y: constant after load (Requirement 4.7) because layout is the initial load's layout
const purifiedCount = [...state.states.values()].filter((v) => v === "PURIFIED").length;
const aliveCount = total - purifiedCount;
```

A monster in the `DYING` state is still alive: it can return to `ALIVE` through a rollback, and only `PURIFIED` counts as purified. X (`aliveCount`) and the purified count come from the same `state.states` map in one render, so they change together in one update (Requirements 4.5, 4.6). The counter text is `Monsters ${aliveCount} / ${totalCount}`; the word "Vulnerable" is not used anywhere in the HUD. The Purified_Counter is a separate element.

`CounterBar` and `HudTitle` import only `./adapter` types (none needed) and plain props; no violation of the `./adapter`-and-`contracts`-only rule (Requirement 4.8) since they take primitives as props and import nothing from the engine.

### 5. Performance budgets — `src/perf/__tests__/*.perf.test.ts`

New test file(s) under `src/perf/__tests__/`, run by the existing `vitest run` (`pnpm test`), no standalone script (Requirement 5.9). A new fixture `src/perf/largeLayout.ts` generates a 300-room `DungeonLayout` (reusing `mock/dungeonLayout.ts`'s entity/room shapes, with several Boss_Rooms so the `>2` allocation branch is exercised) for Large_Layout tests, and reuses the existing sample (`mockDungeonLayout`, 12 rooms, 2 Boss_Rooms) as the "sample dungeon" baseline for the draw-call and light-count comparisons.

Time budgets are about twice the earlier targets (Requirement 5.2). Each timing test runs one warm-up call, then takes the median of five measured runs with `performance.now()`. Structural limits are strict and are not loosened.

| Perf test | Budget | Notes |
|---|---|---|
| 5.4 placement: `placeRoomEntities` over all rooms of Large_Layout | **100 ms** total | Was 50 ms. |
| 5.5 scale: `scaleFor`/`monsterRadius` once per entity of Large_Layout | **30 ms** total | Was 15 ms. |
| 5.6 tick: one Frame_Loop tick (`entityDriver.tick`, `cameraGlide.tick`, torch and ember tick) on Large_Layout | **16 ms** per tick | Was 8 ms. CPU only; `renderer.render`/`composer.render` are not invoked. |
| 5.7 Draw_Call_Count at Large_Layout vs sample | **equal** (`===`) | Strict. Rooms, entities, flames and embers are batched into a fixed set of instanced objects. |
| 5.8 `PointLight` count at Large_Layout and sample | **≤ 4** (`toBeLessThanOrEqual(4)`) | Strict. Also equals the number of lit slots from `allocateTorches`. |

`Draw_Call_Count` is computed by a small pure helper `src/perf/countDrawCalls.ts`: `scene.traverse` counting visible `Mesh`, `Points`, and `InstancedMesh` instances (not multiplied by instance count), matching the Glossary definition. The perf tests build a real `DungeonRig`-equivalent scene graph via the same `DungeonRooms`/`EntityLayer` builder functions directly (not through React), to keep them fast and environment-independent (`environment: "node"`, no jsdom needed for these specific tests since they operate on `THREE.Scene` directly).

### 6. Single Frame_Loop

No new `requestAnimationFrame` call is introduced anywhere. `dungeonRig.ts`'s existing `render()` remains the only `rAF` scheduler (Requirement 5.1). Torch flicker and ember drift both register through `useTickRegistry` exactly like `entityDriver` and `cameraGlide` already do — `DungeonScene.tsx` gains one more `onTickUpdate` slot (`handleAtmosphereTick`) passed to a new small component `AtmosphereLayer.tsx` (<150 lines) that owns torches + embers and exposes a single combined tick function.

## Data Models

No new persisted data models. New in-memory shapes:

```typescript
// scale.ts
interface ScaleResult {
  readonly regularMonsterHeight: number;
  readonly bossMonsterHeight: number;
  readonly pillarHeight: number;
  readonly pillarGirth: number;
}

// countDrawCalls.ts
interface DrawCallCount {
  readonly meshes: number;
  readonly points: number;
  readonly instancedMeshes: number;
  readonly total: number;
}
```

## Error Handling

- **Reduced_Motion queried once per mount** (existing pattern in `DungeonScene.tsx`/`LoadingScreen.tsx` via `window.matchMedia`): atmosphere and camera glide read the same boolean; no new failure mode.
- **Bloom pass construction failure** (e.g. missing WebGL2 in a test environment): `createDungeonRig` is never exercised in Vitest's `node` environment directly: component-level tests that touch `DungeonScene` already run under `@vitest-environment jsdom` with a mocked canvas/WebGL context (existing pattern); no new mocking strategy is introduced, and the composer follows the same construction-in-effect pattern as the current renderer, so cleanup on unmount already guards against partial construction via the existing `if (canvas == null || container == null) return;` guard.
- **No Boss_Room**: `allocateTorches([])` returns an empty list. The flame `InstancedMesh` is still added with count 0 and no `PointLight` is created, so the light count is 0 ≤ 4 and the Draw_Call_Count shape does not change. A dungeon where no function reaches complexity 15 therefore needs no special case.
- **Unsorted or duplicate ids**: `allocateTorches` sorts and de-duplicates its input, so `bossRoomIds` order from the adapter does not matter.
- **Draw_Call_Count stability under future room-count growth**: the perf test asserts equality against the *current* sample dungeon's count captured at test time (not a hardcoded literal), so it stays correct if the sample fixture changes without a design update.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Regular monster height stays within the mandated band

For any Wall_Height greater than 0, the Scale_Function's regular monster height SHALL be at least 30% and at most 40% of that Wall_Height.

**Validates: Requirements 1.3**

### Property 2: Boss monster is always taller than a regular monster at the same wall height

For any Wall_Height greater than 0, the Scale_Function's boss monster height SHALL be strictly greater than its regular monster height.

**Validates: Requirements 1.4**

### Property 3: Pillar dimensions scale linearly with wall height

For any two positive Wall_Height values `h1` and `h2`, pillar dimensions for `h2` SHALL equal pillar dimensions for `h1` multiplied by `h2 / h1`.

**Validates: Requirements 1.5**

### Property 4: Scale_Function is the only source of monster and pillar size

For any room extent and boss/regular classification, the monster radius computed by `placeRoomEntities` (before the placement clamp) and the pillar dimensions computed by `buildRoomParts` SHALL equal the values derived from `scaleFor`/`monsterRadius` with `wallHeightFor(extent)`.

**Validates: Requirements 1.1, 1.2**

### Property 5: Boss_Monster is the highest-severity entity, ties to the lowest id

For any non-empty list of entities in a Boss_Room, `bossMonsterId` SHALL return the id of an entity whose severity is not lower than any other entity's, and among entities of that severity the lowest entity id. For any room that is not a Boss_Room, no entity SHALL be placed with the boss radius.

**Validates: Requirements 1.4**

### Property 6: Entities stay inside room bounds without overlap (regression)

For any set of entities placed in a room of any extent, every placed entity's sphere SHALL lie fully inside the room box and SHALL NOT overlap any other placed entity's sphere.

**Validates: Requirements 1.7, 1.8**

### Property 7: Boss_Room identification matches the layout rule

For any DungeonLayout whose rooms have sizes derived from complexity (`>= 15` is `"BOSS"`), `bossRoomsOf(layout)` SHALL return exactly the rooms with `size === "BOSS"`, and their ids SHALL equal the set `layout.bossRoomIds`. For the sample layout the result SHALL be `room-001` and `room-002`.

**Validates: Requirements 2.3, 2.6**

### Property 8: Every Boss_Room gets exactly four torches

For any list of distinct Boss_Room ids, `allocateTorches` SHALL return exactly four slots per id, one per corner, so the total slot count is four times the number of Boss_Rooms.

**Validates: Requirements 2.3**

### Property 9: Light allocation follows the room-count rule and the budget

For any list of distinct Boss_Room ids, the number of lit slots from `allocateTorches` SHALL be at most 4. With one id, all four slots of that room are lit. With two ids, exactly the two back corners of each room are lit and both front corners are unlit. With more than two ids, exactly one slot (the back-left corner) is lit in each of the first four ids in ascending order, and every other slot is unlit.

**Validates: Requirements 2.4, 2.7, 2.8, 2.9**

### Property 10: Allocation is deterministic and independent of input order

For any list of Boss_Room ids and any permutation or duplication of it, `allocateTorches` SHALL return the same slots, ordered by ascending room id.

**Validates: Requirements 2.6**

### Property 11: Scene PointLight count equals the lit allocation and never exceeds four

For any DungeonLayout, the number of `PointLight` objects in the built scene SHALL equal the number of lit slots from `allocateTorches(bossRoomsOf(layout) ids)`, SHALL be at most 4, and SHALL NOT change when non-boss rooms are added. Every non-boss room SHALL contribute no light.

**Validates: Requirements 2.4, 2.5**

### Property 12: Torch flicker stays within bounds when motion is not reduced

For any elapsed time and any seed while Reduced_Motion is not active, `flickerFactor` SHALL lie in `[0.75, 1.25]`, and its period SHALL be at least 2 seconds. A Lit_Torch's light intensity and flame intensity, and an Unlit_Torch's flame emissive intensity, SHALL equal their base value times this factor.

**Validates: Requirements 2.10, 2.11**

### Property 13: Reduced motion freezes atmosphere animation

For any two elapsed times while Reduced_Motion is active, every Lit_Torch light intensity, every Unlit_Torch emissive intensity and every Ember_Field particle position SHALL be identical at both times.

**Validates: Requirements 2.15**

### Property 14: Scene has exactly one Ember_Field

For any DungeonLayout, the built scene SHALL contain exactly one Ember_Field object.

**Validates: Requirements 2.12**

### Property 15: Dungeon_Scene disposal releases every created resource

For any mounted Dungeon_Scene, unmounting it SHALL leave no leaked geometry, material, texture, render target, light helper, post-processing pass or event listener: every object created during mount SHALL have had `dispose()` (or `removeEventListener`/`scene.remove`) called exactly once.

**Validates: Requirements 2.16**

### Property 16: Selecting a monster glides the camera to its room

For any DungeonLayout and any entity id inside it, selecting that entity SHALL set the Camera_Controller's glide target to the Room_Focus_View of the room containing that entity, and (absent further input) the camera SHALL converge to that pose.

**Validates: Requirements 3.1**

### Property 17: Clearing selection returns to the Whole_Dungeon_View

For any DungeonLayout, clearing the current selection (via Escape or an empty-space click) SHALL set the Camera_Controller's glide target to the Whole_Dungeon_View computed from that layout's room positions.

**Validates: Requirements 3.2, 3.3**

### Property 18: Reduced motion makes camera glides instantaneous

For any glide target, while Reduced_Motion is active, the camera position and controls target SHALL equal the glide target immediately after the glide is requested.

**Validates: Requirements 3.4**

### Property 19: Manual input cancels an in-progress glide

For any in-progress glide, dispatching a manual camera-control "start" event SHALL stop further automatic progression of that glide, leaving the camera at its current pose.

**Validates: Requirements 3.5**

### Property 20: Monster_Counter and Purified_Counter move together and sum correctly

For any sequence of purify and rollback transitions applied to a layout's entity states, after each transition the Monster_Counter's X SHALL equal the total entity count minus the number of `PURIFIED` entities, the Purified_Counter SHALL equal the number of `PURIFIED` entities, X plus the purified count SHALL equal Y, and Y SHALL be unchanged. A purify SHALL change X by -1 and the purified count by +1 in the same state; a rollback SHALL do the reverse. The rendered text SHALL be `Monsters X / Y` and SHALL NOT contain "Vulnerable".

**Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7**

### Property 21: Entity placement stays within the Large_Layout time budget

For the Large_Layout (300 rooms), placing all entities of every room SHALL complete within 100 ms of CPU time.

**Validates: Requirements 5.4**

### Property 22: Scale_Function evaluation stays within the Large_Layout time budget

For the Large_Layout, evaluating the Scale_Function for every entity SHALL complete within 30 ms of CPU time.

**Validates: Requirements 5.5**

### Property 23: One Frame_Loop tick stays within the per-frame time budget

For the Large_Layout, running one Frame_Loop tick (entity driver, camera glide, torch and ember tick) SHALL complete within 16 ms of CPU time.

**Validates: Requirements 5.6**

### Property 24: Draw_Call_Count does not grow with room count

For any generated layout with at least one Boss_Room, from the sample size up to the 300-room Large_Layout, the Draw_Call_Count SHALL equal the sample dungeon's Draw_Call_Count.

**Validates: Requirements 5.7**

### Property 25: PointLight count never exceeds four as room count grows

For any generated layout from the sample size up to the 300-room Large_Layout, the number of `PointLight` objects SHALL be at most four.

**Validates: Requirements 5.8**

## Testing Strategy

**Unit tests** cover specific examples and edge cases:
- `scaleFor`/`monsterRadius` at representative Wall_Height values matching expected literal outputs.
- `allocateTorches([])` returns an empty list; the sample ids `["room-002", "room-001"]` give two lit back-corner torches per room with `room-001` first.
- `bossRoomsOf(mockDungeonLayout)` returns `room-001` and `room-002` and matches `bossRoomIds`.
- `CounterBar`/`HudTitle` render with example props (text assertions per existing `hud/__tests__/*.test.tsx` conventions), including the exact text `Monsters 6 / 6`.
- `cameraGlide.reset()` called before any `focus()`.
- The stone floor shader module exports non-empty GLSL strings, the floor material is a `ShaderMaterial`, and no `GridHelper` remains in the scene.

**Property tests** (fast-check, at least 100 iterations each, tagged `**Feature: necro-visual-polish, Property N: ...**`) cover Properties 1–25. Files: extend `src/entities/__tests__/entityPlacement.pbt.test.ts` (Property 6), add `src/entities/__tests__/scale.pbt.test.ts` (Properties 1–5), `src/components/dungeon/__tests__/torchAllocation.pbt.test.ts` (Properties 7–10, 12), `src/components/dungeon/__tests__/torches.pbt.test.ts` (Properties 11, 13, 14, 15), `src/components/dungeon/__tests__/cameraGlide.pbt.test.ts` (Properties 16–19), `src/hud/__tests__/counterBar.pbt.test.ts` (Property 20), and `src/perf/__tests__/*.perf.test.ts` (Properties 21–25). Properties 21–23 are timing tests on the fixed Large_Layout with the budgets above (100 ms, 30 ms, 16 ms). Properties 24 and 25 use generated layouts of varying room counts with strict assertions.

Every property test and every performance test is a mandatory deliverable. No test task is optional (Requirement 5.10, 6.9).

All tests run under the existing `pnpm test` (`vitest run`) in `apps/necro-compiler-game`; no standalone benchmark script is added (Requirement 5.9).
