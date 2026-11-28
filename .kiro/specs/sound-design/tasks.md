# Implementation Plan: Sound Design

## Overview

Each app gets its own dependency-free Web Audio layer in `src/audio/` (`apps/necro-compiler-game` and `apps/infrashield-chaos`). The language is TypeScript (strict, no `any`). Work proceeds per app: mute store and voices, palette, engine, React hook and `MuteToggle`, then event wiring at the call sites listed in the design. `adapter.ts` files and `packages/morpheus-ast-core/` are not touched. Every source file in `src/audio/` stays at or under 150 lines. The last three tasks run `lint:boundaries`, `typecheck` and the full test suite.

## Tasks

- [x] 1. Build the Necro_App audio module (`apps/necro-compiler-game/src/audio/`)
  - [x] 1.1 Create `muteStore.ts` and `voices.ts`
    - `muteStore.ts`: `readMuteState(storageKey)` returns `true` only for `"true"` and `false` for `"false"`, missing, malformed or throwing reads (default unmuted). `writeMuteState` wraps `setItem` in try/catch. Provide a `MuteStore` with `value`, `set`, `subscribe`. Storage_Key literal `"necro-compiler.muted"`.
    - `voices.ts`: enveloped oscillator, filtered noise burst and noise sweep factories. Per-voice gain capped at 0.5, envelope starting and ending at 0, Effect duration clamped to 2 s, `onended` stops and disconnects sources, invalid inputs clamped.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 4.5, 7.1, 7.4, 7.5, 7.6_

  - [x] 1.2 Create `palette.ts` with the Necro recipes
    - `buildDroneAmbience` (two detuned low sine/triangle oscillators plus LFO-modulated low-pass noise), whisper/thud select, rising shimmer (noise sweep plus bell partials) cast, purify chime, reversed falling shimmer undo, dull denied thump, deep gong.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.6_

  - [x] 1.3 Create `engine.ts` (`createAudioEngine` and `getAudioEngine` singleton)
    - Optional `contextFactory` parameter for tests, defaulting to `AudioContext` or `webkitAudioContext`. No context is created before `primeOnGesture()`. First gesture creates the context, `Master_Gain` (0.126) and resumes. Later gestures are no-ops via a boolean flag.
    - Every `play*` method returns early when no gesture has occurred, when muted, or when `AudioContext` is unsupported.
    - `toggleMute()` persists, ramps `Master_Gain` to 0 within 30 ms and stops Ambience when muting, and restores gain and Ambience when unmuting after a gesture.
    - `dispose()` stops and disconnects live sources in per-node try/catch and closes the context.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.4, 2.6, 2.7, 2.8, 3.1, 3.2, 4.1, 4.6, 4.7, 7.5, 7.6_

  - [x] 1.4 Create `useAudioEngine.ts`, `MuteToggle.tsx` and `index.ts`
    - Hook attaches `pointerdown`, `keydown`, `touchstart` listeners that are all removed on the first firing, then calls `primeOnGesture()`. It attaches an `M`/`m` keydown listener ignored when focus is in input, textarea or select. It exposes `{ muted, toggleMute }` via subscription and removes listeners and calls `dispose()` on unmount.
    - `MuteToggle` is styled like the app's `tour-replay` "?" button, with `aria-pressed={muted}` and `aria-label` of "Mute sound" or "Unmute sound".
    - `index.ts` re-exports the public surface. No import from `adapter.ts`, the other app, or the core package.
    - _Requirements: 1.2, 2.2, 2.3, 2.4, 2.5, 4.6, 7.1, 7.2, 7.3_

  - [x] 1.5 Write unit tests with a `Mock_Context` (`src/audio/__tests__/mockContext.ts` and engine/mute tests)
    - Mute persistence round-trip with jsdom `localStorage`. Engine works when `getItem` and `setItem` throw. No context before first gesture. A request before the first gesture or while muted creates no context, oscillator or buffer source. Master gain is 0.126. `M` key toggles and is ignored in a focused input. `MuteToggle` click toggles and flips `aria-pressed`.
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x] 1.6 Write property test for mute fallback
    - **Property 2: Invalid or absent stored mute values fall back to the default**
    - Use `fast-check`, at least 100 runs, arbitrary strings excluding `"true"` and `"false"` plus the absent-key case.
    - **Validates: Requirements 2.1, 3.2, 3.4**

- [x] 2. Build the Infra_App audio module (`apps/infrashield-chaos/src/audio/`)
  - [x] 2.1 Create `muteStore.ts` and `voices.ts`
    - Same contract as 1.1, with Storage_Key literal `"infrashield-chaos.muted"`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 4.3, 4.4, 4.5, 7.1, 7.4, 7.5, 7.6_

  - [x] 2.2 Create `palette.ts` with the InfraShield recipes
    - Server hum (50 to 60 Hz sine plus quiet filtered noise), alarm (3 square-wave pulses plus low impact), cascade tick, ascending two-note patch applied, descending two-note rollback, keyboard click burst, soft success chime.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.6_

  - [x] 2.3 Create `engine.ts` exposing `playFaultAlarm`, `playCascadeTick`, `playPatchApplied`, `playPatchRollback`, `playBugfixClick`, `playLoadComplete`
    - Same gesture gate, mute, master gain, `contextFactory` and `dispose` behavior as 1.3.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.4, 2.6, 2.7, 2.8, 3.1, 3.2, 4.1, 4.6, 4.7, 7.5, 7.6_

  - [x] 2.4 Create `useAudioEngine.ts`, `MuteToggle.tsx` and `index.ts`
    - Same behavior as 1.4. `MuteToggle` reuses the shape of the existing `BUTTON` style used by `ReplayButton` (28×28, monospace, cyan on dark, bordered).
    - _Requirements: 1.2, 2.2, 2.3, 2.4, 2.5, 4.6, 7.1, 7.2, 7.3_

  - [x] 2.5 Write unit tests with a `Mock_Context` (`src/audio/__tests__/`)
    - Same coverage as 1.5 for Infra_App, using its Storage_Key.
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x] 2.6 Write property test for mute fallback
    - **Property 2: Invalid or absent stored mute values fall back to the default**
    - **Validates: Requirements 2.1, 3.2, 3.4**

- [x] 3. Wire Necro_App events
  - [x] 3.1 Mount the audio hook and `MuteToggle`
    - Call `useAudioEngine` once near the root in `apps/necro-compiler-game/src/App.tsx`. Render `<MuteToggle />` beside `<ReplayButton />` in `src/tour/TourChrome.tsx` (`.tour-corner`).
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 5.1, 7.2_

  - [x] 3.2 Wire spell events in `src/spells/useSpellGame.ts`
    - `playSelect()` on monster select. `playCast()` and `playPurify()` after `CAST_SUCCESS`. `playUndo()` after `UNDO_SUCCESS`. `playDenied()` when the target has `suggestedSpell === null`. Each event triggers exactly one Effect call.
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.3 Wire load completion in `src/hud/load/useLoadDialog.ts`
    - Call `playLoadComplete()` once when `run()` reaches `{ status: "success" }`.
    - _Requirements: 5.7_

  - [x] 3.4 Write wiring tests (Mock_Context)
    - Each wired event triggers exactly one call to its mapped engine method. `MuteToggle` appears next to the "?" button.
    - _Requirements: 8.3, 8.4_

- [x] 4. Wire Infra_App events
  - [x] 4.1 Mount the audio hook and `MuteToggle`
    - Call `useAudioEngine` in `apps/infrashield-chaos/src/App.tsx`. Change the `InspectorDock` `extra` prop to render `ReplayButton` and `MuteToggle` together.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 6.1, 7.2_

  - [x] 4.2 Wire controller events in `src/hooks/useCityController.ts`
    - `playFaultAlarm()` after `inject()` resolves and layout is set. `playPatchApplied()` after `applyPatch()` succeeds. `playPatchRollback()` after `rollback()` resolves.
    - _Requirements: 6.2, 6.4, 6.5_

  - [x] 4.3 Add the capped cascade tick callback
    - Add `onCascadeReveal?: () => void` to `BuildParams` in `src/components/city/faultTypes.ts`. Fire it in `faultTick.ts` when a node's `revealed` flips from false to true. In `useFaultAnimation.ts`, export a counting wrapper that forwards at most 12 calls per `buildFaultAnimation` invocation. `FaultOverlay.tsx` supplies `playCascadeTick` from the engine. `components/city` must not import `src/audio` in `faultTick.ts`.
    - _Requirements: 6.3_

  - [x] 4.4 Wire bugfix spec sounds
    - Call `playBugfixClick()` in `src/components/panels/BugfixSpecButton.tsx` on reaching `done`, and in `BugfixDownloadButton.tsx` after `downloadTextFile` returns without throwing.
    - _Requirements: 6.6_

  - [x] 4.5 Wire load completion in `src/hooks/useRepoSwitch.ts`
    - Call `playLoadComplete()` in `accept()` when `outcome.ok` is true and in the success branch of `backToSample()`.
    - _Requirements: 6.7_

  - [x] 4.6 Write property test for the cascade tick cap
    - **Property 1: Cascade tick count never exceeds the cap**
    - Use `fast-check`, at least 100 runs, non-negative counts. Forwarded calls equal `Math.min(count, 12)`.
    - **Validates: Requirements 6.3, 8.7**

  - [x] 4.7 Write wiring tests (Mock_Context)
    - Each wired event triggers exactly one engine call. A 20-node cascade reveal emits exactly 12 ticks.
    - _Requirements: 8.4, 8.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Run `pnpm run lint:boundaries`
  - Run from the repository root and fix any violation (no imports from `src/audio/` into adapters or the core package, `adapter.ts` and `packages/morpheus-ast-core/` unchanged). Result must be zero violations.
  - _Requirements: 7.3, 7.7_

- [x] 7. Run `pnpm run typecheck`
  - Run from the repository root and fix every error. Confirm no `any` in `src/audio/` and that each file there is at most 150 lines.
  - _Requirements: 7.5, 7.6, 8.8_

- [x] 8. Run the full test suite across all packages and apps
  - The root `pnpm test` script covers only `morpheus-ast-core` and `./site`, so run `pnpm --recursive run test` (add `--run` behavior as each package defines) to include both apps. Fix any failure. Result must be zero failures.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests validate Property 1 (cascade cap) and Property 2 (mute fallback) from the design.
- The root `test` script does not include the apps, so task 8 uses the recursive form.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "2.3"] },
    { "id": 3, "tasks": ["1.4", "2.4"] },
    { "id": 4, "tasks": ["1.5", "1.6", "2.5", "2.6", "3.1", "3.2", "3.3", "4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["3.4", "4.6", "4.7"] },
    { "id": 6, "tasks": ["5"] },
    { "id": 7, "tasks": ["6"] },
    { "id": 8, "tasks": ["7"] },
    { "id": 9, "tasks": ["8"] }
  ]
}
```
