# Design Document

## Overview

This feature replaces every mock data source in `apps/infrashield-chaos/` with the real `morpheus-ast-core` engine, reached exclusively through `src/adapter.ts` (`InfraShieldAdapter`, `createInfraShieldAdapter()`). The adapter already exists as a near-complete composition root (`loadSampleRepository`, `injectFault`, `applyMutation`, `rollbackLastMutation`, `getSREDashboard`, `generateBugfixSpec`, `generateBugfixFile`) and already imports only `contracts.ts` and `src/index.ts` from the core package, so most of Requirement 1's boundary rules are already satisfied by the current file. The team approved editing this file (the "Person A part") for this feature, which `apps/necro-compiler-game/src/adapter.ts` establishes as the precedent: it adds `virtualSources`, `castSpellInMemory`, and `rollbackRecord` so patches can be applied to an in-memory sample repository instead of disk.

Four structural gaps separate the current `InfraShield_App` from this target state:

1. `App.tsx` statically imports `./mock/faultScenario.ts`, `./mock/sreDashboard.ts`, and `./mock/mockAdapter.ts`, and never touches `adapter.ts` at all. There is no lazy loading, no loading screen, no error panel, no `createInfraShieldAdapter()` call.
2. `InfraShieldAdapter.applyMutation`/`rollbackLastMutation` call `engine.applySurgicalMutation`/`engine.rollbackMutation`, which operate on disk files — there is no in-memory `Virtual_Copy` of the sample repository's source text, so Apply Patch and Rollback cannot work against `loadSampleRepository()`'s result. `injectFault` never calls `engine.planRemediation`, so there is no Deterministic_Patch.
3. `useCityPositions` is a fixed 4-column grid keyed only by array index, not a force-directed solver, and ignores `CyberCityLayout.edges` entirely.
4. `CyberCityScene`'s camera is set once at a fixed world position (`0, 20, 28`) and never reframed for layout size or on resize.

The design follows the two sibling specs directly: `necro-real-engine-integration` for the lazy-load/loading-screen/error-panel pattern (`useAdapterLoader`, `LoadingScreen`, `ErrorPanel`) and its `useStableRoomPositions` stability wrapper over a pure force-directed solver (`forceLayout.ts`, `frameCamera.ts`); and `deterministic-remediation` for the `engine.planRemediation(finding, sourceText, { errorCause })` call that produces a rule-based patch with no AI dependency. No file under `packages/` or `apps/necro-compiler-game/` is modified; this design only adds to `apps/infrashield-chaos/` and `.kiro/specs/infrashield-chaos/tasks.md`.

## Architecture

```
App.tsx
 ├─ useAdapterLoader()            (new: src/engine/useAdapterLoader.ts)
 │     dynamic import("./adapter") → createInfraShieldAdapter() → loadSampleRepository()
 │     state: "loading" | "error" | "ready"
 │
 ├─ LoadingScreen                  (new: src/hud/LoadingScreen.tsx)
 ├─ ErrorPanel                     (new: src/hud/ErrorPanel.tsx)
 │
 └─ ready:
      layout: CyberCityLayout (App-level useState, seeded from loadState.layout)
      CyberCityScene(layout, ...)         <- uses useCityForceLayout + frameCamera, replaces useCityPositions grid
      InjectFaultButton + Fault_Selector  <- new FaultTypeSelect, calls adapter.injectFault
      SREDashboardPanel(dashboard, findings, adapter)  <- adapter replaces every mock/*.ts prop source
```

### Why the adapter gains in-memory mutation, mirroring `NecroCompilerAdapter`

`loadSampleRepository()` loads `engine.getSampleRepository()`'s files as `virtualFiles` in a `ParseRequest`, but the resulting `TopologyGraph` carries no reference back to that in-memory text, and `applyMutation`/`rollbackLastMutation` go straight to `engine.applySurgicalMutation`/`engine.rollbackMutation`, which assume a file path resolvable on disk. Requirement 7.6 requires Apply Patch, Rollback and Reset to touch no file system. `NecroCompilerAdapter` already solves exactly this with a `virtualSources: Map<string, string>` holding the sample's source text, `engine.applyMutationToText`/`engine.rollbackMutationText` operating on that map's strings, and `reanalyzeVirtual()` re-running `analyze()` with the updated `virtualFiles`. `InfraShieldAdapter` adopts the identical shape: a `virtualSources` map, a `castToVirtual`-style in-memory apply path, and a `reanalyzeVirtual()` helper, with `Healthy_State` defined as the original `sample.files` entries captured once in `loadSampleRepository()` for Requirement 4.7's Reset.

### Why `planRemediation` is called inside `injectFault`, not a new method

Requirement 6.1 ties the Deterministic_Patch directly to fault injection: "WHEN `injectFault` resolves, THE Adapter SHALL call `engine.planRemediation`". The existing `injectFault` already computes `this.lastFault` and already has a `buildBedrockRequest()` helper that locates the target function's source slice from `this.sources`. The design adds a parallel `buildDeterministicPatch(fault, graph)` call right after `this.lastFault = fault`, using the same function-lookup logic, and renames the existing bedrock-sourced map (`this.sources`) role to serve both call sites — the deterministic path needs the *whole file's* source text (not a slice) because `planRemediation` re-parses it and returns offsets into it, whereas the Bedrock path only needs the function's slice for the prompt. Both reads come from the same `virtualSources`/`sources` map; no redundant storage is introduced.

### Why the city layout keeps `useCityPositions`'s call site but replaces its body

`CyberCityScene.tsx` calls `useCityPositions(layout.nodes)` once, assigns the result to `positions`, and passes it unchanged into `CityNodes`, `CityEdges`, and `buildFaultAnimation`. Requirement 2 only changes how positions are computed, not this call shape, so `useCityPositions` is rewritten in place to call a new pure module pair (`src/layout/forceLayout.ts`, `src/layout/frameCamera.ts`, following the necro-game file names and roles exactly) instead of the grid formula, and to accept `layout.edges` as a second argument (its current signature take only `nodes`, so every caller — just `CyberCityScene.tsx` — is updated to pass both).

## Components and Interfaces

### `src/engine/useAdapterLoader.ts` (new)

Same shape as `apps/necro-compiler-game/src/engine/useAdapterLoader.ts`, retyped for this app:

```ts
export type AdapterLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly adapter: InfraShieldAdapter; readonly layout: CyberCityLayout };

export interface AdapterLoader {
  readonly state: AdapterLoadState;
  readonly retry: () => void;
}

export function useAdapterLoader(): AdapterLoader;
```

- `loadAdapter()` runs `const { createInfraShieldAdapter } = await import("../adapter.ts")` → `const adapter = createInfraShieldAdapter()` → `const layout = await adapter.loadSampleRepository()`, satisfying Requirement 1.1–1.2.
- A monotonically increasing `attempt` ref discards stale results exactly as the necro-game loader does, satisfying Requirement 1.5's "repeat the loading sequence" without a superseded response clobbering a newer one.
- `retry()` resets `state` to `"loading"` and bumps a `request` counter that re-runs the effect.
- No other file imports `./adapter` as a value; `App.tsx` only imports this hook plus `type`-only imports of `CyberCityLayout`/`InfraShieldAdapter` where needed for prop types (erased at compile time, so Requirement 1.6 is not violated by type-only imports, matching the sibling design's reasoning).

### `src/hud/LoadingScreen.tsx` and `src/hud/ErrorPanel.tsx` (new)

Presentational components styled in SRE_Style (cyan/amber/red on dark, monospace), structurally identical to the necro-game pair:

```ts
export function LoadingScreen(): JSX.Element;       // "Loading topology graph..." message
export function ErrorPanel(props: {
  readonly message: string;
  readonly onRetry: () => void;
}): JSX.Element;                                     // role="alert", message, Retry button
```

Both read `window.matchMedia("(prefers-reduced-motion: reduce)").matches` once to gate any animated loading affordance, consistent with the existing `CyberCityScene` pattern and Requirement 8.3's scope (static color/opacity changes only, no pulse).

### `src/App.tsx` (rewritten)

- Drops every `./mock/*` import and the `mockAdapter` import.
- Calls `const { state: loadState, retry } = useAdapterLoader()`.
- Branches on `loadState.status`: `"loading"` → `<LoadingScreen />`; `"error"` → `<ErrorPanel message={loadState.message} onRetry={retry} />`; `"ready"` → the dungeon-equivalent city tree below.
- Holds `const [layout, setLayout] = useState<CyberCityLayout>(loadState.layout)`, `const [selectedId, setSelectedId] = useState<string | null>(null)`, and `const [faultType, setFaultType] = useState<FaultType>("UNCAUGHT_EXCEPTION")`, re-seeded from a fresh `loadState.layout` whenever a `retry()` produces a new `"ready"` instance (keyed by adapter instance identity, following the same re-seed pattern the necro design uses).
- `handleInject` resolves the target id per Requirement 4.4 (`selectedId ?? highestCentralityId(layout.nodes)`), calls `await adapter.injectFault({ targetFunctionId, faultType })`, and on success calls `setLayout`; on rejection it keeps `layout` unchanged and stores the error message in a local `actionError` state rendered inline (Requirement 4.6) — this is independent of `loadState`, which stays `"ready"`.
- `handleReset` calls `await adapter.reset()` (new adapter method, below) and resets `layout`, `selectedId`, and the implicit patch state (`layout.activeFault === null` after reset already clears the dashboard's `lastPatch` display, since `getSREDashboard()` reads `this.lastPatch`, which `reset()` nulls alongside `lastFault`).
- `handleApplyPatch` / `handleRollback` call `adapter.applyMutation(currentPatchSplices)` / `adapter.rollbackLastMutation()`, then `setLayout(result)`; on rejection, `layout` is left unchanged and `actionError` is set (Requirement 7.9).
- File stays under 150 lines per Requirement 9.2 by delegating all presentational/control logic to the existing and new child components; `App.tsx` itself only wires state and callbacks.

### `src/components/city/FaultTypeSelect.tsx` (new)

```ts
export const FAULT_TYPES: readonly FaultType[] = ["LATENCY", "NETWORK_FAILURE", "EXTREME_PAYLOAD", "UNCAUGHT_EXCEPTION"];

interface Props {
  readonly value: FaultType;
  readonly onChange: (next: FaultType) => void;
}
export function FaultTypeSelect({ value, onChange }: Props): JSX.Element;
```

A `<select>` rendering exactly `FAULT_TYPES` as `<option>`s (Requirement 4.1), styled and positioned immediately beside `InjectFaultButton` inside the same fixed-position wrapper `<div>` in `App.tsx` (Requirement 4.2). `InjectFaultButton` itself is unchanged except that `App.tsx` now passes a real `onInject`/`onReset` instead of mock setters.

### `src/layout/forceLayout.ts` (new) — the Layout_Solver

```ts
export interface CityForceLayoutResult {
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
}

export function computeCityForceLayout(
  nodes: readonly CityNode[],
  edges: readonly CityEdge[]
): CityForceLayoutResult;
```

Ported from `apps/necro-compiler-game/src/layout/forceLayout.ts`'s `computeForceLayout`, adapted to `CityNode`/`CityEdge` (buildings/roads instead of rooms/corridors) and to a size radius derived from `complexity` rather than a `RoomSize` enum:

- `n === 0` returns `{ positions: new Map() }` immediately (Requirement 2.1's zero case).
- Every node's initial position is seeded by `initialPosition(index, total)`, a deterministic ring placement (`cos`/`sin` over `index / total`) — no `Math.random` anywhere in the module (Requirement 2.4).
- `FOOTPRINT_RADIUS(node) = Math.max(node.complexity * 0.4, 1.2)` (building footprint half-extent grows with complexity, matching `CityNodes.tsx`'s existing `height = max(complexity * 0.5, 0.5)` convention) drives both the repulsion minimum-separation and the final overlap check, so Requirement 2.8's no-overlap guarantee is defined in terms of the same radius the renderer uses.
- The same three-stage algorithm as `forceLayout.ts` (pairwise repulsion scaled by overlap, spring attraction along `edges`, weak gravity to origin, then a hard-separation pass) runs for a fixed `ITERATIONS` and fixed `MAX_DISPLACEMENT`, which keeps the function a pure, terminating computation over its two array arguments — no wall-clock or random input anywhere, which is what makes Requirement 2.5's determinism property hold.
- Final `y` is always `0` for every node (Requirement 2.2 — InfraShield has no `BOSS`-style raised bases unlike the dungeon, since "building base" is explicitly flat per Requirement 2.2).
- Every coordinate is produced by finite arithmetic over finite inputs (`complexity` is a non-negative integer from `TopologyGraph`, positions are seeded finite and only updated by `+=`/clamped `MAX_DISPLACEMENT` steps), so outputs are finite by construction (Requirement 2.7); the design does not special-case `NaN`/`Infinity` inputs because `complexity`, as produced by `buildTopologyGraph`, is always a finite non-negative number.

### `src/layout/frameCamera.ts` (new)

Ported from `apps/necro-compiler-game/src/layout/frameCamera.ts` unchanged in algorithm (centroid + bounding-radius + 45°-elevation camera placement), renamed internally to operate on `CityForceLayoutResult["positions"]`. `CyberCityScene.tsx`'s one-time camera setup effect is extended: after the initial `camera.position.set(0, 20, 28)` seed, a `useEffect` keyed on `positions` calls `frameCamera(positions)` and applies `camera.position.copy(frame.position)`, `controls.target.copy(frame.target)`, `controls.maxDistance = frame.maxDistance`, `controls.update()` — re-run on every `positions` change (new layout) and on the existing `onResize` handler (Requirement 2.10), which already recomputes `camera.aspect`/`updateProjectionMatrix` and now also re-applies the current frame.

### `src/hooks/useCityPositions.ts` (rewritten in place)

```ts
export function useCityPositions(
  nodes: readonly CityNode[],
  edges: readonly CityEdge[]
): ReadonlyMap<string, THREE.Vector3>;
```

Wraps `computeCityForceLayout` in a `useMemo` keyed on `[nodes, edges]`, replacing the grid formula entirely. `CyberCityScene.tsx`'s one call site (`useCityPositions(layout.nodes)`) is updated to `useCityPositions(layout.nodes, layout.edges)`. No stability wrapper (`useStableRoomPositions`) is needed here: unlike the dungeon, which must keep monster/room entities from jumping across a cast/undo cycle while other rooms are added or removed, Requirement 2.6 only requires that an *unchanged* node/edge set yield the same positions after a fault/patch/rollback cycle — and because `computeCityForceLayout` is a deterministic pure function of `(nodes, edges)` (Requirement 2.5), re-running it on the exact same arrays (same ids, same complexity values, same edges) already returns identical positions with no memo-stability wrapper required. `buildCityLayout` in `adapter.ts` never changes a node's `id` or `complexity` across fault/patch/rollback — only `isFaulted`/`isAffected` flags change — so the `useMemo` dependency array is narrowed to the derived `(ids, complexities, edgeIds)` rather than the whole `nodes`/`edges` arrays, so a fault-only re-render does not even recompute the layout.

### `src/adapter.ts` (modified — Person A part)

Additions, mirroring `NecroCompilerAdapter`:

```ts
export class InfraShieldAdapter {
  // existing fields unchanged, plus:
  private readonly virtualSources = new Map<string, string>();
  private healthySnapshot: readonly VirtualFile[] = [];

  async loadSampleRepository(): Promise<CyberCityLayout> {
    const sample = this.engine.getSampleRepository();
    this.healthySnapshot = sample.files;
    this.virtualSources.clear();
    for (const file of sample.files) this.virtualSources.set(file.filePath, file.sourceText);
    await this.reanalyzeVirtual();
    return this.buildCityLayout(null, null);
  }

  async injectFault(request: FaultInjectionRequest): Promise<CyberCityLayout> {
    this.requireGraph();
    const fault = await this.engine.injectFault(request, this.currentGraph!);
    this.lastFault = fault;
    this.lastPatch = this.buildDeterministicPatch(fault);   // Requirement 6.1–6.3, synchronous
    this.requestAIPatch(fault);                               // Requirement 6.4–6.6, fire-and-forget
    return this.buildCityLayout(fault, null);
  }

  async applyMutation(request: MutationRequest): Promise<MutationResult> {
    const filePath = request.splices[0]!.filePath;
    const source = this.virtualSources.get(filePath)!;
    const text = this.engine.applyMutationToText(source, request.splices);
    this.virtualSources.set(filePath, text.mutatedSource);
    this.lastMutation = {
      mutationId: text.rollbackRecord.mutationId, filePath,
      splicesApplied: request.splices.length, mutatedSource: text.mutatedSource,
      rollbackRecord: text.rollbackRecord, durationMs: 0,
    };
    await this.reanalyzeVirtual();
    return this.lastMutation;
  }

  async rollbackLastMutation(): Promise<void> {
    if (this.lastMutation == null) throw new AdapterError("rollbackLastMutation: no mutation to roll back.");
    const current = this.virtualSources.get(this.lastMutation.filePath)!;
    this.virtualSources.set(
      this.lastMutation.filePath,
      this.engine.rollbackMutationText(current, this.lastMutation.rollbackRecord)
    );
    this.lastMutation = null;
    await this.reanalyzeVirtual();
  }

  async reset(): Promise<CyberCityLayout> {
    this.virtualSources.clear();
    for (const file of this.healthySnapshot) this.virtualSources.set(file.filePath, file.sourceText);
    this.lastFault = null;
    this.lastPatch = null;
    this.lastMutation = null;
    await this.reanalyzeVirtual();
    return this.buildCityLayout(null, null);
  }

  private buildDeterministicPatch(fault: FaultInjectionResult): BedrockPatchSuggestion | null {
    const fn = this.currentGraph!.functions.find((f) => f.id === fault.targetFunctionId);
    const finding = this.findingForFault(fault, fn);
    const source = fn === undefined ? undefined : this.virtualSources.get(fn.filePath) ?? this.sources.get(fn.filePath);
    if (fn === undefined || source === undefined || finding === null) return null;

    const plan = this.engine.planRemediation(finding, source, { errorCause: true });
    if (plan === null) return null;

    return {
      mutationId: `deterministic-${fault.targetFunctionId}-${Date.now()}`,
      targetFunctionId: fault.targetFunctionId,
      suggestedSplices: plan.splices,
      rationale: "This patch was generated by rule-based deterministic remediation, not by an AI model.",
      confidence: 1,
      modelId: "deterministic",
      durationMs: 0,
    };
  }

  private requestAIPatch(fault: FaultInjectionResult): void {
    const patchRequest = this.buildBedrockRequest();
    if (patchRequest === null) return;
    void this.engine.generateBedrockPatch(patchRequest)
      .then((patch) => { if (this.lastFault === fault) this.lastPatch = patch; })
      .catch(() => { /* best effort: keep the Deterministic_Patch, no throw, no console write */ });
  }

  private async reanalyzeVirtual(): Promise<void> {
    const virtualFiles = [...this.virtualSources].map(([filePath, sourceText]) => ({ filePath, sourceText }));
    await this.analyze({ filePaths: [], virtualFiles, includeSourceText: true });
  }
}
```

- `findingForFault` builds (or locates, if `currentFindings` already has a matching `UNCAUGHT_EXCEPTION`/`UNUSED_VARIABLE`/etc. entry for `fault.targetFunctionId`) a `SecurityScanResult` shaped like the Synthetic_Finding pattern from `deterministic-remediation`'s adapter-merge rule — reusing the finding whose `functionId` matches `fault.targetFunctionId` when one exists in `this.currentFindings`, and only synthesizing a minimal one (category inferred from `fault.faultType`, e.g. `UNCAUGHT_EXCEPTION` faults map to the `UNCAUGHT_EXCEPTION` category) when none does, so `planRemediation` always receives a `SecurityScanResult` whose `category` it supports when a true fix exists. Faults with no matching scan category (`LATENCY`, `NETWORK_FAILURE`, `EXTREME_PAYLOAD`) have no corresponding `planRemediation` category, so `findingForFault` returns `null` for them and `buildDeterministicPatch` returns `null` — the UI already renders "no patch" via `AIPatchCard`'s existing `lastPatch === null` branch, with no new component logic required, satisfying Requirement 6.1–6.3 for the one fault type (`UNCAUGHT_EXCEPTION`) that has a deterministic fix and leaving the other three with a correctly empty patch rather than a fabricated one.
- `analyze()` is extended to also refresh `this.virtualSources`-independent `this.sources` map exactly as it does today (unchanged), so `buildBedrockRequest()` keeps working without modification.
- `reset()` is new; `App.tsx`'s Reset button calls it directly instead of re-running `loadSampleRepository()`, since `loadSampleRepository()` would re-fetch `getSampleRepository()` and re-snapshot `healthySnapshot`, which is redundant and — because `getSampleRepository()` is specified as returning the same sample every call — behaviorally equivalent but wasteful; `reset()` instead restores the already-captured snapshot, directly implementing `Healthy_State` from the glossary.
- Every added/changed line stays within the "Person A part" the team approved; no change to `generateBugfixSpec`, `getSREDashboard`, `ingestExternalFindings`, `queryBlastRadius`, or any exported type's existing fields (additive only: `reset` is a new public method, `virtualSources`/`healthySnapshot` are new private fields).

### `src/mock/*` disposition (Requirement 5.4–5.6)

- `App.tsx` drops its imports of `mock/faultScenario.ts`, `mock/sreDashboard.ts`, and `mock/mockAdapter.ts`.
- `mock/mockAdapter.ts`'s only non-test importer today is `App.tsx`; once removed, nothing in `src/` imports it. It has no test file of its own (confirmed: no `mockAdapter.test.ts`/`mockAdapter.pbt.test.ts` exists), so per Requirement 5.6 ("SHALL not keep a Mock_Files module that no test or source file uses") this file is **deleted**, along with `mock/faultScenario.ts` and `mock/sreDashboard.ts` and `mock/cityLayout.ts` if and only if each is confirmed to have no remaining test importer at implementation time — the task list must re-check actual importers (via grep) at implementation time rather than relying on this design's current read, since this design's own review did not find any `__tests__` file under `src/mock/` or elsewhere importing these three modules.
- `BugfixSpecButton`'s `BugfixSpecProvider` structural interface is satisfied directly by `InfraShieldAdapter` (it already has `generateBugfixSpec(): BugfixSpec`), so `SREDashboardPanel`'s `adapter` prop in `App.tsx` changes from `mockAdapter` to the real `InfraShieldAdapter` instance with no interface change needed in `BugfixSpecButton.tsx`.

## Data Models

No existing field of `CyberCityLayout`, `CityNode`, `CityEdge`, `SREDashboardData`, or any `contracts.ts` type is changed. New types are confined to the loader state and the two new layout modules:

- **`AdapterLoadState` / `AdapterLoader`** (new, `src/engine/useAdapterLoader.ts`) — as shown above.
- **`CityForceLayoutResult`** (new, `src/layout/forceLayout.ts`) — `{ positions: ReadonlyMap<string, THREE.Vector3> }`.
- **`CameraFrame`** (new, `src/layout/frameCamera.ts`) — `{ position, target, maxDistance, camDist }`, identical shape to the necro-game version.
- **`InfraShieldAdapter` additions** — `virtualSources: Map<string, string>` (private), `healthySnapshot: readonly VirtualFile[]` (private), `reset(): Promise<CyberCityLayout>` (public, new).

## Error Handling

| Failure point | Requirement | Handling |
|---|---|---|
| `import("./adapter")` rejects | 1.4, 1.5 | `useAdapterLoader` catches, sets `status: "error"`; `retry()` re-issues the whole sequence |
| `createInfraShieldAdapter()` throws | 1.4 | Same catch (all three load steps run in one `try`) |
| `loadSampleRepository()` rejects | 1.4 | Same catch |
| `injectFault` rejects | 4.6 | `App.tsx`'s `handleInject` catches, sets `actionError`, leaves `layout` state unchanged |
| `generateBedrockPatch` rejects (inside `requestAIPatch`) | 6.5 | Caught inside the adapter itself; `lastPatch` (the Deterministic_Patch) is left as-is; no throw reaches the UI, no `console.*` call is made |
| Stale Bedrock resolution for a superseded fault | 6.6 | `requestAIPatch` captures `fault` by closure and only writes `this.lastPatch` `if (this.lastFault === fault)`, an identity check against the *current* `lastFault`, so a later `injectFault` call invalidates any in-flight promise from an earlier one |
| `applyMutation` / `rollbackLastMutation` rejects | 7.9 | `App.tsx`'s handlers catch, set `actionError`, leave `layout` unchanged; the adapter itself does not mutate `virtualSources` before `engine.applyMutationToText`/`rollbackMutationText` throws, since both are synchronous validations that run before any `this.virtualSources.set(...)` call |
| `findingForFault` finds no supported category for the injected fault | 6.1–6.3 (scope) | `buildDeterministicPatch` returns `null`; `lastPatch` stays `null` until (if ever) an `AI_Patch` arrives; `AIPatchCard`'s existing `lastPatch === null` branch renders "— Awaiting AI patch —", which is accurate for these fault types since no Deterministic_Patch exists for them |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do.*

### Property 1: Every node receives a finite, flat-plane position

For any array of `CityNode`s (including the empty array) and any array of `CityEdge`s referencing only ids present in that node array, `computeCityForceLayout` SHALL return a position for every node id, each with `y === 0` and with `x`, `y`, and `z` all finite numbers.

**Validates: Requirements 2.1, 2.2, 2.7**

### Property 2: Determinism

For any array of `CityNode`s and `CityEdge`s, calling `computeCityForceLayout` twice with deeply equal arguments SHALL produce deeply equal position maps, regardless of any unrelated fault, patch, or mutation state elsewhere in the application.

**Validates: Requirements 2.5, 2.6**

### Property 3: No two footprints overlap

For any array of `CityNode`s and `CityEdge`s, the positions returned by `computeCityForceLayout` SHALL be such that for every pair of distinct nodes, the XZ distance between their positions is at least the sum of their footprint radii.

**Validates: Requirements 2.8**

### Property 4: Bounded total footprint

For any array of at least 10 `CityNode`s and any `CityEdge`s, the area of the axis-aligned bounding box of the positions returned by `computeCityForceLayout` (padded by each node's own footprint radius) SHALL be at most 4 times the sum of the individual building footprint areas.

**Validates: Requirements 2.9**

### Property 5: The computed camera frame keeps every building in view

For any non-empty position map returned by `computeCityForceLayout`, the `CameraFrame` returned by `frameCamera` for that map SHALL place every position within the view frustum defined by that frame's `position`, `target`, and a standard perspective camera's field of view at `camDist`.

**Validates: Requirements 2.10**

### Property 6: Default fault target is the highest-centrality node

For any non-empty array of `CityNode`s with varying `centralityScore` values, the function that selects the default Inject Fault target when no `Selected_Building` exists SHALL return the node with the maximum `centralityScore`, resolving ties by the first such node in array order.

**Validates: Requirements 4.4**

### Property 7: A stale AI patch answer never overwrites a newer fault's state

For any sequence of two distinct `injectFault` calls on the Adapter where the first call's Bedrock answer resolves after the second call has already updated `lastFault`, the Adapter's `lastPatch` after both resolutions SHALL never equal the stale first answer's patch.

**Validates: Requirements 6.6**

### Property 8: The patch label is a pure function of `modelId`

For any `BedrockPatchSuggestion`, the label-deriving function used by `AI_Patch_Card` SHALL return the Deterministic_Patch label if and only if `modelId === "deterministic"`, and the AI_Patch label otherwise.

**Validates: Requirements 6.7**

### Property 9: Apply then rollback restores the Virtual_Copy byte-for-byte

For any `MutationRequest` whose splices are produced by `engine.planRemediation` against the Adapter's currently loaded Virtual_Copy, calling `applyMutation` followed by `rollbackLastMutation` SHALL leave the Virtual_Copy's source text for the affected file byte-identical to its text before `applyMutation` was called.

**Validates: Requirements 7.5**

## Testing Strategy

**Unit / example tests** (vitest, `__tests__` convention already used in this app):

- `useAdapterLoader`: success path reaches `"ready"`; a rejection at each of the three load steps reaches `"error"` with that step's message; `retry()` re-runs all three steps. Mirrors `necro-compiler-game/src/engine/__tests__/useAdapterLoader.test.tsx`.
- `LoadingScreen` / `ErrorPanel`: render-only checks (message text, Retry button fires `onRetry`).
- `FaultTypeSelect`: renders exactly the four `FaultType` options in order (Requirement 4.1).
- `App.tsx` integration-style tests (mocked adapter): inject-success updates layout; inject-failure preserves layout and shows the error; reset clears fault/patch/selection; apply/rollback gate their buttons on patch/mutation presence (Requirements 4.6, 4.7, 7.7, 7.8, 7.9).
- Adapter example tests: `buildDeterministicPatch` returns a patch with `modelId === "deterministic"` and the required rationale text for an `UNCAUGHT_EXCEPTION` fault, and `null` for a fault type with no supported finding category; a Bedrock-rejection example asserts `lastPatch` is unchanged and no `console.error`/`console.warn` call occurred (`vi.spyOn(console, "error")`/`"warn"`).
- A dedicated Download-flow test exercising inject → `generateBugfixFile()` → asserting `fileName === "bugfix.md"` and `content` contains the fault's `targetFunctionId`, serving as the evidence named in Requirement 6.11 for TASK-IS-13.

**Property-based tests** (fast-check, following `src/components/city/__tests__/faultAnimation.pbt.test.ts`'s existing convention): `src/layout/__tests__/forceLayout.pbt.test.ts` and `frameCamera.pbt.test.ts` implement Properties 1–5; `src/components/city/__tests__/faultTarget.pbt.test.ts` implements Property 6; `src/adapter.__tests__/stalePatch.pbt.test.ts` implements Property 7 with randomized fault id/resolution-order sequences against a mocked `engine.generateBedrockPatch`; `src/components/panels/__tests__/aiPatchCard.pbt.test.ts` extends the existing `sreDashboard.pbt.test.ts` file or adds a sibling for Property 8; `src/adapter.__tests__/virtualRoundTrip.pbt.test.ts` implements Property 9 against `createInfraShieldAdapter()` with the real sample repository (no network, no disk — same no-mock, in-memory style as `necro-real-engine-integration`'s Integration_Test).

**Integration test** (Requirement 7.10, 1–2 concrete runs, real engine, Node environment, no mocks): `createInfraShieldAdapter()` → `loadSampleRepository()` → `injectFault({ targetFunctionId, faultType: "UNCAUGHT_EXCEPTION" })` → read the resulting `lastPatch.suggestedSplices` → `applyMutation({ splices })` → assert the Virtual_Copy's source differs from the original → `rollbackLastMutation()` → assert the Virtual_Copy's source is byte-identical to the original. This also serves as the Requirement 11 verification path and part of the TASK-IS-13 evidence (Requirement 6.11, 10.3).

**Build verification** (Requirement 11.3, manual/CI step, not a test file): run `vite build` for `apps/infrashield-chaos` and record each emitted chunk's byte size, confirming the adapter/core-engine code is isolated into its own lazily-loaded chunk the same way `vite build` isolates it for `apps/necro-compiler-game`.
