# Design Document

## Overview

This feature replaces the mock dungeon and mock spell caster used today by `src/App.tsx` with the real engine, reached exclusively through `src/adapter.ts` (`NecroCompilerAdapter`, `createNecroAdapter()`). Three structural facts drive the design:

1. `src/adapter.ts` imports `createEngine` from `packages/morpheus-ast-core/src/index.js`, which in turn imports `web-tree-sitter` and (transitively, through `contracts.ts` types used by `getSpellHint`) the Bedrock client. These are heavy, so the adapter module must become a dynamic import boundary rather than a static one.
2. `NecroCompilerAdapter` already *is* a valid `SpellCaster` — it exposes `castSpell(request: MutationRequest): Promise<MutationResult>` and `rollbackLastSpell(): Promise<void>` with exactly the shapes `src/spells/spellCaster.ts` expects. `src/mock/mockSpellCaster.ts` can be dropped from `App.tsx` with no change to `useSpellGame`, `spellReducer`, or `spellState.ts`.
3. `DungeonLayout`, `DungeonRoom`, `DungeonCorridor`, `DungeonEntity` are already defined in `adapter.ts` and already consumed throughout `src/components/dungeon/*`, `src/layout/forceLayout.ts`, `src/entities/*`, and `src/hud/*` by type. No consuming component needs its prop types changed — only the data source (`mockDungeonLayout` → a real `DungeonLayout` from `loadSampleRepository()`) changes.

The work is therefore concentrated in `App.tsx` (today 45 lines, importing the mock modules directly) and a small set of new modules that own: the lazy adapter boundary, the loading/error UI, layout-refresh-after-cast sequencing, and room-position stability across refreshes. `src/adapter.ts` itself, `packages/`, and the other app are not touched, per the Scope Decisions in requirements.md.

## Architecture

```
App.tsx
 ├─ useAdapterLoader()         (new: src/engine/useAdapterLoader.ts)
 │    dynamic import("./adapter") → createNecroAdapter() → loadSampleRepository()
 │    state: "loading" | "ready" | "error"
 │
 ├─ LoadingScreen               (new: src/hud/LoadingScreen.tsx)
 ├─ ErrorPanel                  (new: src/hud/ErrorPanel.tsx)
 │
 └─ ready:
      useSpellGame(layout, adapter)         <- adapter used directly as SpellCaster (existing hook, unchanged)
      useStableRoomPositions(layout)         (new: src/layout/useStableRoomPositions.ts)
      DungeonScene(layout, ...)              (existing, unchanged props)
      SpellBar / Grimoire / MonsterTooltip / ErrorToast (existing, unchanged)
```

`useSpellGame` currently takes a fixed `layout: DungeonLayout` prop and never changes it (Requirement 6 needs the displayed layout to change after cast/undo). Rather than rewire the reducer — which requirements.md scopes away from (`adapter.ts` and the reducer's cast/undo semantics are not to be reimplemented) — the layout refresh is lifted into `App.tsx`: `App` holds the current `DungeonLayout` in its own `useState`, re-derives it by calling `adapter.buildDungeonLayout()` at the two points Requirement 6 names, and passes the fresh layout into `useSpellGame` and `DungeonScene`. `useSpellGame`'s internal `lookup` (via `indexEntities`) is recomputed automatically because it is already `useMemo(() => indexEntities(layout), [layout])` — no change needed there.

### Why a dedicated hook for the adapter load

`useAdapterLoader` isolates the three awaits of Requirement 1–4 (`import("./adapter")`, `createNecroAdapter()`, `loadSampleRepository()`) and the retry behavior of Requirement 3 behind one small state machine, so `App.tsx` only renders three cases (loading / error / ready) and stays near its current size.

### Why layout refresh happens in `App`, not in the reducer

`spellState.ts`'s `SpellState` has no `layout` field today, and Requirement 5.2 forbids a wrapper class around `castSpell`/`rollbackLastSpell`. Keeping the `DungeonLayout` in `App`-level state, separate from `SpellState`, satisfies 5.1–5.2 (the adapter is used directly, unmodified) while still letting `App` react to `CAST_SUCCESS`/`UNDO_SUCCESS` transitions by calling `buildDungeonLayout()`. `App` observes these transitions by watching `state.pending` falling edge combined with `state.error === null`, distinguishing cast-complete from undo-complete via the previous `pending.kind` (captured in a ref), and — for cast — waiting for the `DYING` animation to finish (Requirement 6.3) before swapping the layout.

## Components and Interfaces

### `src/engine/useAdapterLoader.ts` (new)

```ts
export type AdapterLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly adapter: NecroCompilerAdapter; readonly layout: DungeonLayout };

export interface AdapterLoader {
  readonly state: AdapterLoadState;
  readonly retry: () => void;
}

export function useAdapterLoader(): AdapterLoader;
```

- On mount and on each `retry()`, runs: `const { createNecroAdapter } = await import("./adapter.ts")` → `const adapter = createNecroAdapter()` → `const layout = await adapter.loadSampleRepository()`.
- A monotonically increasing `attempt` ref/state guards against a stale response from a superseded load (e.g. two rapid retries) overwriting a newer one — the effect compares its own captured `attempt` to the latest before committing state.
- Catches rejection from any of the three steps and sets `{ status: "error", message }`, satisfying Requirement 3.1. Because `import()` is re-issued on every call (ES module dynamic import results are cached by the runtime, but the *attempt* — including the `createNecroAdapter()` and `loadSampleRepository()` calls that follow it — is re-run), Requirement 3.4 is satisfied: a new attempt is always possible, whether the failure was in the import or in a later step.
- Only the *failure path* is retried from the top; loading state is always re-entered on `retry()` per Requirement 3.3.

### `src/adapter.ts` is reached only dynamically

No file outside `src/engine/useAdapterLoader.ts` imports from `./adapter`. Today `App.tsx`, `src/spells/spellCaster.ts` (type-only), `src/spells/useSpellGame.ts` (type-only), `src/spells/entityIndex.ts` (type-only), and every `src/components/dungeon/*` file import *types* from `../adapter.ts`. Requirement 1.2 restricts the *static value* import, not type-only imports — `import type { ... } from "./adapter.ts"` is erased by the TypeScript compiler and contributes no runtime module edge, so it does not pull `web-tree-sitter`/Bedrock into the entry chunk. The existing type-only imports across `spells/*` and `components/dungeon/*` are left exactly as they are; this design verifies with the production build (Requirement 1.3) that bundler output, not just source text, places the adapter and core engine in a separate chunk. `App.tsx` drops its current static value imports of `mockDungeonLayout` and `createMockSpellCaster` and adds no static value import of `./adapter`.

### `src/hud/LoadingScreen.tsx` (new)

```ts
interface Props { /* no props: purely presentational */ }
export function LoadingScreen(): JSX.Element;
```

- Renders `"Summoning the dungeon..."` in a `<p>`/`<h1>` styled with `font-family: Cinzel, ...` (same convention as `.hud-title` in `hud.css`) and `var(--panel)`/`var(--gold)`/`var(--bone)` custom properties from `paletteStyle` (Requirement 2.3–2.4).
- Reads `window.matchMedia("(prefers-reduced-motion: reduce)").matches` once at render (same pattern already used in `DungeonScene.tsx`) to decide whether to apply a CSS animation class (Requirement 2.5).
- `App` mounts `<LoadingScreen />` only while `state.status === "loading"` and swaps it for the dungeon scene once `status === "ready"` (Requirement 2.1, 2.6).

### `src/hud/ErrorPanel.tsx` (new)

```ts
interface Props {
  readonly message: string;
  readonly onRetry: () => void;
}
export function ErrorPanel({ message, onRetry }: Props): JSX.Element;
```

- Styled with the existing `.hud-panel` class (same as `ErrorToast.tsx`/`Grimoire.tsx`) so it matches the HUD palette without new CSS tokens; a `role="alert"` region, message text, and a single Retry `<button>` wired to `onRetry` (Requirement 3.2).

### `src/App.tsx` (modified)

- Replaces `const [caster] = useState(() => createMockSpellCaster())` and the static `mockDungeonLayout` import with `const { state: loadState, retry } = useAdapterLoader()`.
- Branches on `loadState.status`:
  - `"loading"` → render `<LoadingScreen />` only.
  - `"error"` → render `<ErrorPanel message={loadState.message} onRetry={retry} />`.
  - `"ready"` → render the existing dungeon/HUD tree, now driven by `loadState.adapter` and a `layout` state value seeded from `loadState.layout`.
- Holds `const [layout, setLayout] = useState(loadState.layout)` (re-seeded via a `key`/effect when `loadState` transitions to a new `"ready"` instance after a retry) and `useSpellGame(layout, loadState.adapter)`.
- A `useEffect` keyed on `(state.pending, state.error)` implements Requirement 6: when a `CAST` becomes non-pending with no error, it waits `DYING_SECONDS * 1000` (imported from `entities/entityTransition.ts`, already the single source of truth for that duration) before calling `loadState.adapter.buildDungeonLayout()` and `setLayout`; when an `UNDO` becomes non-pending with no error, it calls `buildDungeonLayout()` and `setLayout` immediately. `useStableRoomPositions` (below) is what actually keeps rooms from jumping once `setLayout` fires.

### `src/layout/useStableRoomPositions.ts` (new)

```ts
export function useStableRoomPositions(
  rooms: readonly DungeonRoom[],
  corridors: readonly DungeonCorridor[]
): ReadonlyMap<string, THREE.Vector3>;
```

- Wraps `computeForceLayout` (unchanged) with memoization keyed on the *set* of room ids rather than on `rooms`/`corridors` identity, which is what `useDungeonPositions` does today (it recomputes on every new `rooms`/`corridors` array, i.e. every layout refresh — this is the gap Requirement 7 closes).
- Keeps a `useRef<ReadonlyMap<string, THREE.Vector3>>` of the last computed positions and the room-id set that produced them. On each call: if the new room-id set is identical (same size, same members) to the cached set, returns the cached map unchanged (Requirement 7.2). If it differs, calls `computeForceLayout` and, for any room id present in both the old and new sets, overwrites the freshly computed position with the previously stable one before caching — satisfying 7.3 (new rooms get their computed position, existing rooms keep theirs) and 7.4 (removed rooms simply drop out of the map; survivors are unchanged).
- `src/components/dungeon/useDungeonPositions.ts` (14 lines) is replaced by this hook at its one call site in `DungeonScene.tsx`; the file is deleted since nothing else imports it (Requirement 12.5).

### `src/mock/*` disposition

- `src/mock/dungeonLayout.ts` (`mockDungeonLayout`, 220 lines): its only non-test importer today is `App.tsx`. Once `App.tsx` no longer imports it, its remaining importer is `src/layout/__tests__/forceLayout.pbt.test.ts`, a test file — so per Requirement 12.6 the module itself is kept, and only the `App.tsx` import is removed.
- `src/mock/mockSpellCaster.ts` (`createMockSpellCaster`): its only non-test importer today is `App.tsx`. Its own test, `mock/mockSpellCaster.test.ts`, keeps using it directly, so per 12.6 the module is kept; only the `App.tsx` import is removed.
- No mock module is deleted; Requirement 4.5 ("no mock data module in production code") is satisfied because `App.tsx` — the only production entry point that assembled the mock into the running app — no longer references either module.

### Entity selection without hints (`suggestedSpell` stays `null`)

No new module is needed: `buildDungeonLayout()` in `adapter.ts` already sets every entity's `suggestedSpell: null` (seen in `buildEntities`, two call sites), and `getSpellHint` is simply never called anywhere in the UI. `src/hud/SpellBar.tsx` already computes `const noSpell = selected !== null && selected.entity.suggestedSpell === null` and renders `"No spell is known for this monster yet."` while leaving `castEnabled` (computed in `useSpellGame` from `selected.entity.suggestedSpell !== null`) `false` — Requirements 8.1–8.5 are already met by existing code once real entities (all with `suggestedSpell: null`) flow through, and `src/components/dungeon/monsterPicker.ts`'s `isPickable` gating already operates per-entity, not per-`suggestedSpell`, so every entity stays selectable (8.2).

## Data Models

No new domain types are introduced for dungeon data — `DungeonRoom`, `DungeonCorridor`, `DungeonEntity`, `DungeonLayout`, `EntityType`, `RoomSize` (all in `src/adapter.ts`, lines 36–84) are reused as-is. New types are confined to the loader state and are shown above (`AdapterLoadState`, `AdapterLoader`).

### Entity id stability across cast/undo (Requirement 9)

`buildEntities` in `adapter.ts` derives `entityId` as `` `entity-${finding.findingId}` `` for findings and `` `zombie-${fn.id}-${varName}` `` for unused variables (lines ~280–300 of `adapter.ts`). `fn.id` and `varName` are stable, so `zombie-*` ids return to their original values after undo. `findingId` comes from a global counter, so `entity-*` ids change on every analysis (measured in task 6.3; total entity count is preserved). This is verified, not assumed: Requirement 9 requires the implementer to actually diff the id sets against the sample repository during implementation and record the result (and any resulting reducer change) in the Final Report; this design does not pre-empt that measurement.

## Error Handling

| Failure point | Requirement | Handling |
|---|---|---|
| `import("./adapter")` rejects | 3.1, 3.4 | `useAdapterLoader` catches, sets `status: "error"`; `retry()` re-issues the import |
| `createNecroAdapter()` throws | 3.1 | Same catch in `useAdapterLoader`'s load sequence (all three steps run in one `try`) |
| `loadSampleRepository()` rejects | 3.1, 4.1 | Same catch |
| `castSpell` rejects | 5.5 | Already handled by `spellReducer`'s `CAST_FAIL` branch (existing `state.error`, unchanged); `App` does not advance `layout` on this path because the refresh effect only runs when `state.error === null` |
| `rollbackLastSpell` rejects | 5.5 | Already handled by `UNDO_FAIL` (existing); same non-advance-on-error guard applies |
| Retry while a previous load is still in flight | — (robustness) | `useAdapterLoader` discards results from superseded attempts via the attempt-id guard, so no stale `"ready"` state can clobber a newer `"error"`/`"loading"` state |

All error text shown to the player is the underlying `Error.message` (or `NecroAdapterError.message`), matching the existing convention in `failureMessage()` (`src/spells/useSpellGame.ts`) and `ErrorToast.tsx`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do.*

### Property 1: Unchanged room-id set keeps every position identical

For any sequence of two layouts `L1`, `L2` where the set of room ids in `L2` equals the set of room ids in `L1`, calling `useStableRoomPositions` on `L1` and then on `L2` yields a position for every room id in `L2` that is reference-equal (or coordinate-equal) to its position after `L1`.

**Validates: Requirements 7.1, 7.2**

### Property 2: Adding rooms never moves an existing room

For any layout `L1` and any layout `L2` formed by adding one or more rooms to `L1` (every room id of `L1` present in `L2`, plus new ids not in `L1`), calling `useStableRoomPositions` on `L1` and then `L2` yields, for every room id that was already in `L1`, the same position as before; new room ids receive a defined position.

**Validates: Requirements 7.3**

### Property 3: Removing rooms never moves a surviving room

For any layout `L1` and any layout `L2` formed by removing one or more rooms from `L1` (every room id of `L2` present in `L1`), calling `useStableRoomPositions` on `L1` and then `L2` yields, for every room id still present in `L2`, the same position as before.

**Validates: Requirements 7.4**

### Property 4: Zombie ids and per-type entity counts are preserved by a cast/undo round trip

For any zombie entity and any rename suffix, building the layout, casting the rename, rebuilding the layout, rolling the cast back, and rebuilding the layout again yields (a) a `zombie-*` entity-id set equal to the original one and (b) the same entity count per `EntityType` as the original. `entity-<findingId>` ids are not asserted: `findingId` comes from a global counter and is regenerated on every analysis, so the reducer clears selection on undo.

**Validates: Requirements 9.1**

*(This property exercises the real adapter against the sample repository with no mocks and no network, matching the Integration_Test's constraints; it is the same mechanism Requirement 9 asks the implementer to check manually, expressed as an automated, repeatable property.)*

## Testing Strategy

**Unit / example tests** (vitest, following the existing `__tests__` convention):
- `useAdapterLoader`: success path reaches `"ready"` with the layout from a mocked `loadSampleRepository`; a rejection at each of the three steps reaches `"error"` with that step's message; `retry()` after an error re-runs all three steps.
- `ErrorPanel` / `LoadingScreen`: render-only checks (text content, Retry button fires `onRetry`) — not profitable as property tests per the PBT guidance (fixed, non-input-varying UI).
- `useStableRoomPositions`: example cases for "same id set twice → same Map reference/values", "add a room → old rooms unchanged", "remove a room → remaining rooms unchanged" double as the property tests above.

**Property-based tests** (fast-check, `src/layout/__tests__/useStableRoomPositions.pbt.test.ts`, following the existing `forceLayout.pbt.test.ts` convention): implement Properties 1–4 above.

**Integration test** (`Integration_Test`, Requirement 10, 1–2 concrete runs rather than property iterations — this exercises the real engine end to end, so cost and determinism favor a handful of examples over 100 randomized ones):
- `createNecroAdapter()` → `loadSampleRepository()` → build a `MutationRequest` from `getSourceText(filePath)` and a chosen room/entity's known range → `castSpell(request)` → assert `getSourceText(filePath)` differs from the original → `rollbackLastSpell()` → assert `getSourceText(filePath)` is byte-identical to the original. No network, no AWS, no disk — the sample repository is in-memory by construction (`loadSampleRepository`/`virtualSources` in `adapter.ts`).

**Build verification** (Requirement 1.3, 11.4, not a test file but a required manual/CI step): run `vite build` for `apps/necro-compiler-game` and inspect `dist/assets/*.js` chunk names and sizes to confirm the adapter/core-engine code is isolated from the entry chunk, and report each chunk's byte size in the Final Report (Requirement 11.4, 13.2).
