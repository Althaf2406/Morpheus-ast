# Implementation Plan: InfraShield Real Engine Integration

## Overview

Migrate `apps/infrashield-chaos/` from `src/mock/` data to the real `morpheus-ast-core` engine, reached only through `src/adapter.ts`. The language is TypeScript (React, Three.js, vitest, fast-check), as in the design. Work proceeds in this order: adapter (virtual copy, deterministic patch), pure layout modules, lazy loader and screens, scene and interaction, panels, `App.tsx` rewrite, mock removal, then verification and task tracking.

Scope limits (Requirement 9): edit only `apps/infrashield-chaos/`, `.kiro/specs/infrashield-chaos/tasks.md` and this spec. Do not edit `packages/` or `apps/necro-compiler-game/`, do not edit `.kiro/specs/infrashield-real-engine-integration/.config.kiro`, and make no git commit. Use no `any`. Keep every file under `src/components/` and `src/App.tsx` below 150 lines, so `CyberCityScene.tsx` (156 lines) and `useFaultAnimation.ts` (236 lines) must be split when touched. Use group comments only inside components.

## Tasks

- [x] 1. Adapter: virtual copy, deterministic patch, AI patch
  - [x] 1.1 Add the in-memory Virtual_Copy and `reset()` to `apps/infrashield-chaos/src/adapter.ts`
    - Add private `virtualSources` and `healthySnapshot`; fill both in `loadSampleRepository()` from `engine.getSampleRepository()`
    - Add `reanalyzeVirtual()` that calls `analyze()` with `virtualFiles` and `includeSourceText: true`
    - Rewrite `applyMutation` to use `engine.applyMutationToText` on `virtualSources`, store `lastMutation` with its rollback record, then re-analyze; do this with no file system write
    - Rewrite `rollbackLastMutation` to use `engine.rollbackMutationText`, clear `lastMutation`, then re-analyze; reject with `AdapterError` when no mutation exists
    - Add public `reset(): Promise<CyberCityLayout>` that restores `healthySnapshot` and clears `lastFault`, `lastPatch` and `lastMutation`
    - Leave `virtualSources` untouched when the engine call throws
    - Keep imports limited to `contracts` and `src/index`
    - _Requirements: 1.7, 4.7, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 9.4_

  - [x] 1.2 Add Deterministic_Patch and guarded AI patch to `injectFault` in `adapter.ts`
    - Add `findingForFault` (reuse a matching entry of `currentFindings`, synthesize one for `UNCAUGHT_EXCEPTION`, return `null` for fault types with no remediation category)
    - Add `buildDeterministicPatch` calling `engine.planRemediation(finding, source, { errorCause: true })`; set `modelId` to `"deterministic"` and a rationale stating the patch is rule-based and not from an AI model
    - Store the Deterministic_Patch in `lastPatch` when `injectFault` resolves
    - Add `requestAIPatch` that runs after the deterministic patch, discards the answer unless `this.lastFault === fault`, and swallows failures with no throw and no console write
    - Confirm by grep that no `console.*` call is reachable from the Bedrock failure path
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 1.3 Write the Node-environment integration test and the Download-flow test
    - Create `apps/infrashield-chaos/src/__tests__/realEngine.integration.test.ts` using `createInfraShieldAdapter()` with the real engine and no mocks
    - Sequence: load, inject `UNCAUGHT_EXCEPTION`, read `lastPatch.suggestedSplices`, apply, assert source changed, rollback, assert source byte-identical to the original
    - Add a Download-flow test: inject fault, call `generateBugfixFile()`, assert `fileName === "bugfix.md"` and that `content` contains the fault's `targetFunctionId`; label it as evidence for TASK-IS-13
    - _Requirements: 6.8, 6.9, 6.11, 7.10_

  - [x] 1.4 Write property test for apply then rollback
    - **Property 9: Apply then rollback restores the Virtual_Copy byte-for-byte**
    - Create `apps/infrashield-chaos/src/__tests__/virtualRoundTrip.pbt.test.ts` against `createInfraShieldAdapter()` with the real sample repository
    - **Validates: Requirements 7.5**

  - [x] 1.5 Write property test for stale AI patch answers
    - **Property 7: A stale AI patch answer never overwrites a newer fault's state**
    - Create `apps/infrashield-chaos/src/__tests__/stalePatch.pbt.test.ts` with randomized fault ids and resolution order against a mocked `generateBedrockPatch`
    - **Validates: Requirements 6.6**

  - [x] 1.6 Write adapter unit tests
    - Create `apps/infrashield-chaos/src/__tests__/adapterPatch.test.ts`
    - Deterministic patch has `modelId === "deterministic"` and the required rationale for `UNCAUGHT_EXCEPTION`; it is `null` for a fault type with no category
    - Bedrock rejection keeps the Deterministic_Patch and makes no `console.error` or `console.warn` call (`vi.spyOn`)
    - A rejecting `applyMutation` leaves the Virtual_Copy unchanged; `reset()` restores the original source
    - _Requirements: 4.7, 6.1, 6.2, 6.3, 6.5, 7.9_

- [x] 2. Deterministic force-directed layout
  - [x] 2.1 Create `apps/infrashield-chaos/src/layout/forceLayout.ts`
    - Export `computeCityForceLayout(nodes, edges): CityForceLayoutResult` with `positions: ReadonlyMap<string, THREE.Vector3>`
    - Port the algorithm of `apps/necro-compiler-game/src/layout/forceLayout.ts` (read only) to `CityNode`/`CityEdge`: ring seeding, pairwise repulsion, edge springs, weak gravity, hard separation pass, fixed iteration count
    - Footprint radius is `max(complexity * 0.4, 1.2)`; `y` is always 0; no `Math.random`; zero nodes returns an empty map
    - Ignore edges whose endpoints are not in the node set
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 2.2 Create `apps/infrashield-chaos/src/layout/frameCamera.ts`
    - Export `frameCamera(positions): CameraFrame` with `position`, `target`, `maxDistance`, `camDist`, following the necro-game algorithm (centroid, bounding radius, 45 degree elevation)
    - Handle an empty map without producing non-finite values
    - _Requirements: 2.10_

  - [x] 2.3 Rewrite `apps/infrashield-chaos/src/hooks/useCityPositions.ts` to use the solver
    - Signature `useCityPositions(nodes, edges)`; memoize on a key derived from node ids, complexities and edge ids so fault-only changes do not recompute positions
    - Remove the grid formula
    - _Requirements: 2.1, 2.5, 2.6_

  - [x] 2.4 Write property tests for the Layout_Solver
    - **Property 1: Every node receives a finite, flat-plane position**
    - **Property 2: Determinism**
    - **Property 3: No two footprints overlap**
    - **Property 4: Bounded total footprint**
    - Create `apps/infrashield-chaos/src/layout/__tests__/forceLayout.pbt.test.ts` (fast-check, one test per property, include the empty array and 10+ node cases)
    - **Validates: Requirements 2.1, 2.2, 2.5, 2.6, 2.7, 2.8, 2.9, 2.11**

  - [x] 2.5 Write property test for the camera frame
    - **Property 5: The computed camera frame keeps every building in view**
    - Create `apps/infrashield-chaos/src/layout/__tests__/frameCamera.pbt.test.ts`
    - **Validates: Requirements 2.10**

- [x] 3. Lazy adapter loader, Loading_Screen and Error_Panel
  - [x] 3.1 Create `apps/infrashield-chaos/src/engine/useAdapterLoader.ts`
    - Export `AdapterLoadState`, `AdapterLoader` and `useAdapterLoader()`, following `apps/necro-compiler-game/src/engine/useAdapterLoader.ts`
    - Run `await import("../adapter.ts")`, then `createInfraShieldAdapter()`, then `loadSampleRepository()` in one `try`
    - Use an attempt counter so a stale result never overwrites a newer one; `retry()` sets `loading` and re-runs the sequence
    - This hook is the only value import of the adapter outside `adapter.ts`; other files use `import type`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [x] 3.2 Create `apps/infrashield-chaos/src/hud/LoadingScreen.tsx` and `apps/infrashield-chaos/src/hud/ErrorPanel.tsx`
    - SRE_Style (cyan, amber, red on dark, monospace); `ErrorPanel` has `role="alert"`, the message and a Retry button calling `onRetry`
    - Gate any animation on `prefers-reduced-motion`
    - Each file below 150 lines
    - _Requirements: 1.3, 1.4, 1.5, 8.3, 9.2_

  - [x] 3.3 Write tests for the loader and screens
    - `apps/infrashield-chaos/src/engine/__tests__/useAdapterLoader.test.tsx`: success reaches `ready`; failure at each of the three steps reaches `error` with the message; `retry()` repeats all steps
    - `apps/infrashield-chaos/src/hud/__tests__/hud.test.tsx`: message text and Retry callback
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 4. Cyber_City scene, interaction and fault controls
  - [x] 4.1 Update the scene: camera framing, single Render_Loop, disposal, size limits
    - Split `useFaultAnimation.ts` (236 lines) and `CyberCityScene.tsx` (156 lines) into files below 150 lines each, keeping the existing `faultAnimation.pbt.test.ts` passing
    - Call `useCityPositions(layout.nodes, layout.edges)`; apply `frameCamera(positions)` to camera position, controls target and `maxDistance` on every positions change and in the resize handler
    - Drive all animation from one `requestAnimationFrame` loop; cancel it on unmount and dispose every geometry, material and texture created
    - With `prefers-reduced-motion: reduce`, show faulted, affected and recovered states as static color changes with no pulse and no camera glide
    - Confirm nodes and edges render with `InstancedMesh`
    - _Requirements: 2.10, 8.1, 8.2, 8.3, 8.4, 9.2, 9.3_

  - [x] 4.2 Add hover, selection and Building_Tooltip
    - Raycast against the node `InstancedMesh` for hover and click; hover highlight and a distinct selection highlight; clicking the selected building keeps it selected
    - Create `apps/infrashield-chaos/src/components/city/BuildingTooltip.tsx` showing function name, file, complexity and centrality; hide it when the pointer leaves
    - Report `onHover` and `onSelect` through `CyberCityScene` props; reuse the existing `CityNodes.tsx` instance groups
    - Keep each file below 150 lines
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 9.2_

  - [x] 4.3 Create `apps/infrashield-chaos/src/components/city/FaultTypeSelect.tsx` and the default-target helper
    - Export `FAULT_TYPES` (`LATENCY`, `NETWORK_FAILURE`, `EXTREME_PAYLOAD`, `UNCAUGHT_EXCEPTION`) and `FaultTypeSelect({ value, onChange })` rendering exactly those options in a `<select>`
    - Create `apps/infrashield-chaos/src/components/city/faultTarget.ts` exporting `highestCentralityId(nodes)` (ties resolve to the first node in array order)
    - Use `import type` for `FaultType` from `../../adapter`
    - _Requirements: 4.1, 4.2, 4.4, 9.4_

  - [x] 4.4 Write tests for the selector and default target
    - **Property 6: Default fault target is the highest-centrality node**
    - Create `apps/infrashield-chaos/src/components/city/__tests__/faultTarget.pbt.test.ts`
    - Add a unit test that `FaultTypeSelect` lists exactly the four options in order
    - **Validates: Requirements 4.1, 4.4**

- [x] 5. Dashboard panels on real data
  - [x] 5.1 Add the patch label to `AIPatchCard`
    - Create `apps/infrashield-chaos/src/components/panels/patchLabel.ts` exporting a pure `patchLabel(patch)` that returns the deterministic label iff `modelId === "deterministic"`, else the AI label
    - Show the label in `apps/infrashield-chaos/src/components/panels/AIPatchCard.tsx`
    - _Requirements: 6.7, 9.2_

  - [x] 5.2 Add the Patch_Controller and real-data wiring to the dashboard
    - Update `SREDashboardPanel.tsx` (split into files below 150 lines if needed): Apply Patch and Rollback buttons; Apply is disabled while no patch exists, Rollback is disabled while no patch has been applied
    - Show the blast-radius score and cascade path from the current fault result and refresh the security findings card from `layout.securityFindings`
    - Disable Generate Bugfix Spec and Download while no fault is injected; build the spec from the current `lastPatch`; offer `fileName` and `content` from `generateBugfixFile()` as the download
    - Props use `import type` from `../../adapter`; no mock imports
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.8, 6.9, 6.10, 7.1, 7.7, 7.8, 9.2_

  - [x] 5.3 Write tests for the panels
    - **Property 8: The patch label is a pure function of `modelId`**
    - Create `apps/infrashield-chaos/src/components/panels/__tests__/patchLabel.pbt.test.ts`
    - Unit tests for button gating (Apply, Rollback, Generate Bugfix Spec, Download) and the blast-radius and findings display; keep `sreDashboard.pbt.test.ts` and `bugfixSpecButton.pbt.test.ts` passing without mock imports
    - **Validates: Requirements 6.7, 6.10, 7.7, 7.8**

- [x] 6. Rewrite `App.tsx`
  - [x] 6.1 Wire loader, scene, selector and dashboard in `apps/infrashield-chaos/src/App.tsx`
    - Remove every `./mock/*` import; branch on `useAdapterLoader()` status to `LoadingScreen`, `ErrorPanel` or the city
    - State: `layout`, `selectedId`, `faultType` (default `UNCAUGHT_EXCEPTION`), `actionError`; re-seed state when a retry yields a new adapter
    - `handleInject` uses `selectedId ?? highestCentralityId(layout.nodes)`; on rejection keep the previous layout and show the error
    - `handleReset` calls `adapter.reset()` and clears layout fault state, patch and selection
    - `handleApplyPatch` and `handleRollback` call the adapter with the current patch splices, set the returned layout, and on rejection keep the layout and show the error
    - Place `FaultTypeSelect` next to `InjectFaultButton`; pass the real adapter to `SREDashboardPanel`
    - Keep `App.tsx` below 150 lines by moving wiring into small hooks or components if needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 7.2, 7.3, 7.4, 7.9, 9.2_

  - [x] 6.2 Write `App` tests with a mocked adapter
    - Create `apps/infrashield-chaos/src/__tests__/App.test.tsx`
    - Inject success updates the layout; inject failure keeps the layout and shows the error; reset clears fault, patch and selection; the default target is used when nothing is selected; apply and rollback failures keep the layout and show the error
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 7.9_

- [x] 7. Remove unused mock files
  - [x] 7.1 Delete unused files under `apps/infrashield-chaos/src/mock/`
    - Grep `apps/infrashield-chaos/src` for importers of `cityLayout.ts`, `faultScenario.ts`, `mockAdapter.ts` and `sreDashboard.ts` before deleting
    - Delete each file with no remaining source or test importer; if a test still needs one, move it under a test folder
    - Remove any export, type or helper that no longer has a consumer (including in `InjectFaultButton.tsx` and `adapter.ts`)
    - _Requirements: 5.4, 5.5, 5.6, 9.4_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Final verification
  - Run in `apps/infrashield-chaos`: `pnpm run typecheck` (zero errors) and `pnpm run test` (zero failures)
  - Run `pnpm run build` in `apps/infrashield-chaos` and record the size of each emitted chunk, including the lazily loaded adapter chunk
  - Run the tests of `packages/morpheus-ast-core` (zero failures)
  - Run the typecheck and tests of `apps/necro-compiler-game` (zero errors, zero failures)
  - Run `pnpm run lint:boundaries` at the repository root (zero violations)
  - Run `git status` and confirm no file under `packages/` or `apps/necro-compiler-game/` changed, `.config.kiro` of this spec is unchanged, and no commit was made
  - Re-read every changed file, checking for `any`, unused exports and imports, and comment style
  - Run `wc -l` on `src/components/**` and `src/App.tsx` of `apps/infrashield-chaos` and confirm every count is below 150
  - Fix any failure and re-run the failing check
  - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7, 9.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

- [x] 10. Update `.kiro/specs/infrashield-chaos/tasks.md`
  - Mark a task completed only when this feature fully completes it, with evidence from task 9; leave every other task unchanged
  - Check TASK-IS-10, 11, 12, 13, 14, 15 and 16 one by one; TASK-IS-12 and TASK-IS-13 are the likely candidates
  - Mark TASK-IS-13 completed only if every element is verified: load the pre-loaded repository, inject fault, verify blast radius, download `bugfix.md` (tests 1.3 and 5.3 as evidence)
  - Do not mark TASK-IS-14, 15 or 16, which need browser checks, profiling and deployment that this feature does not perform
  - Do not edit any other file
  - _Requirements: 10.1, 10.2, 10.3_

## Notes

- All tasks are required, including every test task. The integration and property tests are evidence for the judges and for TASK-IS-13
- Each task references specific requirements for traceability
- Property tests validate the universal properties 1 to 9 of the design; unit and integration tests cover examples and edge cases
- The tests in 1.3 and 5.3 are the evidence for TASK-IS-13, so task 10 can mark it only if they were run and pass
- Per Requirement 9, make no git commit and leave `.config.kiro`, `packages/` and `apps/necro-compiler-game/` untouched

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "3.1", "3.2", "4.3", "5.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "2.4", "2.5", "3.3", "4.4", "5.2"] },
    { "id": 2, "tasks": ["4.1", "1.3", "1.4", "1.5", "1.6", "5.3"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["8"] },
    { "id": 7, "tasks": ["9"] },
    { "id": 8, "tasks": ["10"] }
  ]
}
```
