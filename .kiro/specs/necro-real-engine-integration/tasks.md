# Implementation Plan: Necro Real Engine Integration

## Overview

Language: TypeScript (strict, no `any`), as used in `apps/necro-compiler-game`. All paths below are relative to `apps/necro-compiler-game/` unless stated otherwise. The plan adds a lazy adapter loader, a loading screen, an error panel and a stable room-position hook, then rewires `src/App.tsx` to the real engine. It ends with the integration test, the entity id stability check, and the verification and report tasks.

Constraints that apply to every task: do not edit `src/adapter.ts`, `packages/` or the other app (task 1.3 edits only the Necro app `package.json` and the lockfile); make no commit; keep each component file under 150 lines; use group comments only; leave no unused code or unused mock imports; keep mock modules that a test still uses; import the adapter only through `./adapter` and only dynamically from `src/engine/useAdapterLoader.ts`.

## Tasks

- [x] 1. Lazy adapter loader
  - [x] 1.1 Create `src/engine/useAdapterLoader.ts`
    - Export `AdapterLoadState`, `AdapterLoader` and `useAdapterLoader()` as specified in the design.
    - Load sequence in one `try`: `await import("./adapter")`, `createNecroAdapter()` called once, `await adapter.loadSampleRepository()`.
    - Use an attempt counter so a superseded load cannot overwrite a newer state.
    - `retry()` returns to `"loading"` and repeats the whole sequence, including a new `import()`.
    - Any rejection sets `{ status: "error", message }` using the `Error.message`.
    - Use no static value import of `./adapter` (type-only imports are allowed).
    - _Requirements: 1.1, 1.2, 1.4, 3.1, 3.3, 3.4, 4.1, 12.1, 12.2_

  - [x] 1.2 Write unit tests for `useAdapterLoader`
    - File: `src/engine/__tests__/useAdapterLoader.test.tsx`.
    - Success reaches `"ready"` with the layout from a mocked `loadSampleRepository`; `createNecroAdapter` is called once.
    - A rejection at each of the three steps reaches `"error"` with that message.
    - `retry()` after an error shows `"loading"` and re-runs all three steps.
    - A stale attempt does not overwrite a newer one.
    - _Requirements: 1.4, 3.1, 3.3, 3.4_

  - [x] 1.3 Add test devDependencies to the Necro app only
    - Run `pnpm --filter necro-compiler-game add -D jsdom @testing-library/react` (add `@testing-library/dom` if the installed version needs it as a peer). Edit only `apps/necro-compiler-game/package.json` plus the lockfile update pnpm makes.
    - Do not add these packages to the root or to any other package or app.
    - Component and hook tests (`.test.tsx`) select jsdom with a `// @vitest-environment jsdom` docblock at the top of the file, so `vite.config.ts` stays unchanged.
    - _Requirements: 12.2_

- [x] 2. Loading screen and error panel
  - [x] 2.1 Create `src/hud/LoadingScreen.tsx`
    - Render the text "Summoning the dungeon..." in the Cinzel font family with HUD palette variables.
    - Read `prefers-reduced-motion: reduce` through `window.matchMedia` and omit the animation class when it matches.
    - Add the needed styles in the existing HUD stylesheet or a small style module, following the current `hud` convention.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.2, 12.3, 12.4_

  - [x] 2.2 Create `src/hud/ErrorPanel.tsx`
    - Props `{ message: string; onRetry: () => void }`.
    - Use the existing `.hud-panel` class, a `role="alert"` region, the message, and one Retry button that calls `onRetry`.
    - _Requirements: 3.1, 3.2, 12.2, 12.3, 12.4_

  - [x] 2.3 Write unit tests for `LoadingScreen` and `ErrorPanel`
    - File: `src/hud/__tests__/loadErrorScreens.test.tsx`.
    - Loading text is present; no animation class when reduced motion matches.
    - Error panel shows the message and the Retry button calls `onRetry` once.
    - _Requirements: 2.2, 2.5, 3.2_

- [x] 3. Stable room positions
  - [x] 3.1 Create `src/layout/useStableRoomPositions.ts`
    - Signature `(rooms, corridors) => ReadonlyMap<string, THREE.Vector3>`, wrapping the unchanged `computeForceLayout`.
    - Cache the last positions and room-id set in a ref; return the cached map when the id set is equal.
    - When the set differs, recompute and overwrite every surviving id with its previous position; new ids keep the computed position; removed ids drop out.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 12.2_

  - [x] 3.2 Replace `useDungeonPositions` in `src/components/dungeon/DungeonScene.tsx`
    - Use `useStableRoomPositions` at the single call site.
    - Delete `src/components/dungeon/useDungeonPositions.ts` after confirming nothing else imports it.
    - _Requirements: 7.1, 7.2, 12.3, 12.5_

  - [x] 3.3 Write property test for unchanged id set
    - File: `src/layout/__tests__/useStableRoomPositions.pbt.test.ts`, following `forceLayout.pbt.test.ts`.
    - **Property 1: Unchanged room-id set keeps every position identical**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 3.4 Write property test for added rooms
    - Same file as 3.3.
    - **Property 2: Adding rooms never moves an existing room**
    - **Validates: Requirements 7.3**

  - [x] 3.5 Write property test for removed rooms
    - Same file as 3.3.
    - **Property 3: Removing rooms never moves a surviving room**
    - **Validates: Requirements 7.4**

- [x] 4. Wire `src/App.tsx` to the real engine
  - [x] 4.1 Rewrite `src/App.tsx` around `useAdapterLoader`
    - Remove the static imports of `mockDungeonLayout` and `createMockSpellCaster`; add no static value import of `./adapter`.
    - Render `LoadingScreen` for `"loading"`, `ErrorPanel` with `retry` for `"error"`, and the existing dungeon and HUD tree for `"ready"`.
    - Pass the adapter instance directly to `useSpellGame` as the Spell_Caster; add no wrapper class.
    - Hold the displayed `layout` in `useState`, re-seeded when a new `"ready"` state arrives after a retry.
    - Add an effect on `(state.pending, state.error)` that, on a successful cast, waits `DYING_SECONDS * 1000` (from `entities/entityTransition.ts`) and then calls `adapter.buildDungeonLayout()`; on a successful undo, calls it immediately. Keep the previous layout when `state.error` is set. Capture the previous `pending.kind` in a ref.
    - Never call `getSpellHint`; `suggestedSpell` stays `null`, so the existing SpellBar message and disabled cast button apply.
    - If the effect and refs push `App.tsx` past 150 lines, move the refresh effect into `src/engine/useLayoutRefresh.ts`.
    - _Requirements: 1.2, 2.1, 2.6, 3.1, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 8.1, 8.2, 8.3, 8.4, 8.5, 12.1, 12.3, 12.5, 12.6_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integration test and entity id stability
  - [x] 6.1 Write the Integration_Test `src/engine/__tests__/realEngine.integration.test.ts`
    - Sequence: `createNecroAdapter()`, `loadSampleRepository()`, build a `MutationRequest` from `getSourceText(filePath)` and an entity or room range, `castSpell`, assert the source differs, `rollbackLastSpell`, assert the source equals the original byte for byte.
    - No network, no AWS, no disk; add a comment group naming TASK-NC-12 as the evidence this test provides.
    - Import the adapter only through `../../adapter`, as the test lives in the Necro_UI; if the boundary linter rejects test imports, report it and do not edit `adapter.ts`.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.1, 12.2_

  - [x] 6.2 Write property test for entity id round trip
    - File: `src/engine/__tests__/entityIdStability.pbt.test.ts`, using the real adapter with no mocks and no network.
    - **Property 4: Zombie ids and per-type entity counts are preserved by a cast/undo round trip**
    - **Validates: Requirements 9.1**

  - [x] 6.3 Measure entity id stability and sample dungeon facts
    - Using a temporary script or test run (not left in the repo), build the layout, cast, rebuild, undo, rebuild, and compare the `entityId` sets before the cast and after the undo.
    - If the sets differ, adjust the reducer in `src/spells/spellState.ts` so selection and entity state follow the new ids, and add a test for the change. If they match, make no reducer change.
    - From the initial Layout, record: room count, entity count per `EntityType`, and the count of entities with `suggestedSpell !== null`.
    - Keep the numbers for the Final_Report in task 7.4.
    - _Requirements: 9.1, 9.2, 9.3, 11.1, 11.2, 11.3_

- [x] 7. Verification and report
  - [x] 7.1 Run typecheck, test suite and production build
    - In `apps/necro-compiler-game`, run the typecheck, the tests with a single-run flag (for example `vitest --run`), and the production build. Do not use watch mode.
    - Fix failures in the code this feature changed, then rerun.
    - Record each result.
    - For the build, list every file in `dist/assets/` with its size in bytes (for example `ls -l dist/assets`), and confirm the adapter and core engine code are in a chunk separate from the entry chunk.
    - _Requirements: 1.3, 11.4, 13.1, 13.2_

  - [x] 7.2 Run `pnpm run lint:boundaries`
    - Run from the repository root and confirm zero violations.
    - Search the changed files for the type `any`, static value imports of `./adapter`, and unused mock imports.
    - Confirm with `git status` that `src/adapter.ts`, `packages/` and the other app are unmodified and nothing is committed.
    - _Requirements: 12.1, 12.2, 12.5, 12.7, 12.8, 13.3_

  - [x] 7.3 Re-read changed files and count lines
    - Re-read every file listed by `git status` for this feature.
    - Run `wc -l src/App.tsx src/hud/* src/spells/*` in `apps/necro-compiler-game` and record the counts; confirm each component file is under 150 lines.
    - _Requirements: 12.3, 12.4, 13.4, 13.5_

  - [x] 7.4 Deliver the Final_Report
    - State the results of typecheck, tests, build and `lint:boundaries`.
    - List each build chunk with its size in bytes.
    - Give the `wc -l` counts.
    - State whether the Entity_Id sets were stable and which reducer change, if any, was made.
    - State the room count, entity count per `EntityType`, and the count of entities with `suggestedSpell !== null`.
    - _Requirements: 9.3, 11.1, 11.2, 11.3, 11.4, 13.1, 13.2, 13.3, 13.5_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All test tasks (1.2, 2.3, 3.3, 3.4, 3.5, 6.2) are mandatory for this project; none is marked optional. Property tests in particular must be implemented.
- Test dependencies (`jsdom`, `@testing-library/react`) are devDependencies of `apps/necro-compiler-game` only (task 1.3).
- Properties 1 to 3 share one test file, so their tasks sit in separate waves.
- Property 4 is the automated form of the manual id comparison in Requirement 9; task 6.3 still performs and reports the measurement.
- No mock module is deleted: `src/mock/dungeonLayout.ts` and `src/mock/mockSpellCaster.ts` stay because tests still use them.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "2.2", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "3.2", "3.3"] },
    { "id": 2, "tasks": ["3.4", "4.1"] },
    { "id": 3, "tasks": ["3.5"] },
    { "id": 4, "tasks": ["5"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["7.3"] },
    { "id": 10, "tasks": ["7.4"] },
    { "id": 11, "tasks": ["8"] }
  ]
}
```
