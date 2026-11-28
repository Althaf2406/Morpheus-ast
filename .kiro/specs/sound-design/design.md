# Design Document

## Overview

Each application gets a self-contained, dependency-free synthesized sound layer living entirely in its own `src/audio/` folder:

- `apps/necro-compiler-game/src/audio/`
- `apps/infrashield-chaos/src/audio/`

Both engines are built from the Web Audio API only (no audio files, no npm audio packages) and follow an identical shape so the two implementations stay easy to compare, even though their sound palettes differ (Requirement 5 vs Requirement 6). Neither `adapter.ts` nor `packages/morpheus-ast-core/` is touched (Requirement 7); UI components call into `src/audio/` directly, the same way they already call `./adapter`.

The design is organized as:

1. A shared **engine shape** (`AudioEngine` interface) implemented once per app, tuned to that app's palette.
2. A **gesture gate** that defers `AudioContext` creation until the first user gesture.
3. A **mute store** backed by `localStorage`, wired to a `Mute_Toggle` button and the `M` key.
4. **Effect synth helpers** (oscillator/noise voices with attack/release envelopes) shared conceptually between apps but implemented per app to keep `src/audio/` self-contained and under the 150-line-per-file cap (Requirement 7.6).
5. **Event wiring** at the exact call sites identified in the existing `App.tsx`, hook, and component files of each app.

## Architecture

```
apps/<app>/src/audio/
  engine.ts         // createAudioEngine(): AudioEngine — context lifecycle, gesture gate, master gain
  muteStore.ts       // Mute_State read/write/subscribe, localStorage persistence, Storage_Key
  voices.ts          // low-level oscillator/noise voice builders with envelopes (shared helpers)
  palette.ts         // app-specific Effect/Ambience recipes built from voices.ts
  useAudioEngine.ts  // React hook: owns the singleton engine instance, wires Gesture + "M" key, exposes Mute_Toggle state
  MuteToggle.tsx     // the Mute_Toggle button component, styled like ReplayButton
  index.ts           // re-exports the public surface UI code imports
```

`index.ts` is the only import path UI code uses (e.g. `import { useAudioEngine, MuteToggle } from "../audio";`), keeping `src/audio/` an isolated module the same way `./adapter` is isolated per the existing steering rules. No file in either `src/audio/` folder imports from `./adapter.ts`, from the other app, or from `packages/morpheus-ast-core/`.

### AudioEngine interface (conceptual, duplicated per app with app-specific Effect names)

```typescript
export interface AudioEngine {
  readonly isMuted: boolean;
  toggleMute(): void;
  // Called once by useAudioEngine on first Gesture; idempotent.
  primeOnGesture(): void;
  // Ambience control
  startAmbience(): void;
  stopAmbience(): void;
  // Per-app effect methods, e.g.:
  playSelect(): void;
  playCast(): void;
  playPurify(): void;
  playUndo(): void;
  playDenied(): void;
  playLoadComplete(): void;
  // Lifecycle
  dispose(): void;
}
```

Infra_App's engine exposes the Requirement 6 methods instead (`playFaultAlarm`, `playCascadeTick`, `playPatchApplied`, `playPatchRollback`, `playBugfixClick`, `playLoadComplete`), and both expose `startAmbience`/`stopAmbience`/`toggleMute`/`dispose`.

### Module responsibilities

**`engine.ts` — `createAudioEngine()`**
- Holds a module-level singleton created lazily. No `AudioContext` is constructed in this factory call (Requirement 1.1); only data structures (gain nodes are also deferred — they require a context) and the current `Mute_State` (read from `muteStore`) are set up.
- `primeOnGesture()`: on first call, constructs one `AudioContext`, creates `Master_Gain` (linear gain `0.126`, i.e. -18 dB — Requirement 4.1) connected to `context.destination`, resumes the context, and if `Mute_State` is unmuted, starts Ambience. Every subsequent call is a no-op (Requirement 1.3) guarded by a boolean flag, not by checking `context` nullability alone, so the gate survives repeated gesture events firing in the same tick.
- Every `play*` method first checks: has a Gesture occurred? Is `Mute_State` unmuted? Is `AudioContext` support present (`typeof AudioContext !== "undefined"`, else `webkitAudioContext`)? If any check fails, the method returns immediately without creating any node (Requirements 1.4, 1.5, 2.8).
- `toggleMute()` flips `Mute_State` via `muteStore.set`, and:
  - if now muted: ramps `Master_Gain.gain` to 0 over a short release (≤ 30 ms) to avoid a click, and calls `stopAmbience()` — this "silences … every playing Effect" because all Effects route through `Master_Gain` (Requirement 2.6).
  - if now unmuted and a Gesture has already occurred: ramps `Master_Gain.gain` back to `0.126` and calls `startAmbience()` (Requirement 2.7). If no Gesture has occurred yet, flipping Mute_State only updates stored state; Ambience begins on the eventual first Gesture via `primeOnGesture()`.
- `dispose()` stops/disconnects all live sources, closes the `AudioContext` if one exists, and is called from `useAudioEngine`'s unmount cleanup (Requirement 4.6).

**`muteStore.ts`**
- `readMuteState(storageKey): boolean` — reads `localStorage.getItem(storageKey)`; returns `false` (default unmuted, Requirement 2.1/3.4) unless the stored value is exactly `"true"` (→ `true`) or exactly `"false"` (→ `false`); any other value (missing key, malformed value, or a thrown read) falls back to the default. The `try/catch` around the read satisfies Requirement 3.3.
- `writeMuteState(storageKey, value: boolean): void` — wraps `localStorage.setItem` in `try/catch`, swallowing any thrown error (Requirement 3.3), called on every `Mute_State` change (Requirement 3.1).
- Each app passes its own literal `Storage_Key` (`"necro-compiler.muted"` for Necro_App, `"infrashield-chaos.muted"` for Infra_App — Requirement 3.5) into these functions; the functions themselves are pure and app-agnostic.

**`voices.ts`**
- Small factory functions used by `palette.ts` to build one Effect: e.g. `playEnvelopedOscillator(context, destination, { freq, type, attack, release, duration, gain })`, `playFilteredNoiseBurst(context, destination, { cutoff, duration, gain })`, `playNoiseSweep(...)`. Each factory:
  - creates oscillator/`AudioBufferSourceNode` (noise) plus a per-voice `GainNode` capped at gain `0.5` (Requirement 4.5),
  - schedules a `gain.gain` envelope that starts at 0, ramps up (attack) and back down to 0 (release) before `stop()` (Requirement 4.4),
  - connects the voice's gain node to the engine's `Master_Gain`,
  - registers an `onended` handler on every source node that calls `.stop()` (if not already stopped) and `.disconnect()` so the node is released (Requirement 4.3),
  - clamps every effect's total scheduled duration to ≤ 2 seconds (Requirement 4.2); Ambience nodes are started/stopped explicitly by `startAmbience`/`stopAmbience` and are exempt from the 2-second cap per Requirement 4.2's "except Ambience" clause.
- Noise buffers are generated once per voice call with `context.createBuffer(1, length, sampleRate)` filled with `Math.random() * 2 - 1`, matching "no audio files" (Requirement 7.4).

**`palette.ts` (per app)**
- Necro_App: `buildDroneAmbience`, `buildWhisperEffect` (select), `buildShimmerRise` (cast), `buildPurifyChime`, `buildReverseShimmer` (undo), `buildDeniedThump`, `buildGong` (load complete) — each composed from `voices.ts` primitives per the Requirement 5 recipes (e.g. two detuned low oscillators + LFO-modulated low-pass-filtered noise for the drone; noise sweep + bell partials for the cast shimmer).
- Infra_App: `buildServerHumAmbience`, `buildAlarmEffect` (3 square-wave pulses + low impact), `buildCascadeTick`, `buildPatchAppliedEffect` (ascending two-note), `buildPatchRollbackEffect` (descending two-note), `buildBugfixClickEffect`, `buildLoadCompleteChime` — per Requirement 6.

**`useAudioEngine.ts`**
- A React hook, mounted once near the top of each app's root component (`App.tsx`'s `City`/`Game`, or a dedicated `AudioProvider` if preferred — see Components section), that:
  - obtains the singleton engine via `getAudioEngine()` (module-level `createAudioEngine()` memoized on first import — a singleton rather than per-render state, so multiple components can call effect methods without threading props through every layer),
  - on mount, attaches one-time listeners for `pointerdown`, `keydown`, `touchstart` on `document` with `{ once: true }` is insufficient alone (all three must be removed together once any one fires), so the hook attaches all three, and the handler removes all three listeners and calls `engine.primeOnGesture()` the first time any one fires (Requirement 1.2/1.3),
  - attaches a `keydown` listener for the `M`/`m` key that calls `engine.toggleMute()` unless `document.activeElement` is an `<input>`, `<textarea>`, or `<select>` (Requirement 2.5),
  - exposes `{ muted: boolean; toggleMute: () => void }` (mirroring engine state, re-rendered via a small local `useState` + subscription so `MuteToggle`'s `aria-pressed` stays in sync — Requirement 2.3),
  - on unmount, removes the Gesture and `M` key listeners and calls `engine.dispose()` (Requirement 4.6).

**`MuteToggle.tsx`**
- A button matching the visual style of each app's existing `ReplayButton` ("?" button) — in Infra_App it reuses the `BUTTON` style object's shape (28×28, monospace, cyan on dark, bordered) per Requirement 2.2; in Necro_App it reuses the `tour-replay` CSS class treatment. It renders `🔇`/`🔈` (or `M`/`Mute`/`Unmuted` text) with `aria-pressed={muted}` and `aria-label={muted ? "Unmute sound" : "Mute sound"}` (Requirement 2.3), and calls `toggleMute` from `useAudioEngine` on click (Requirement 2.4).
- Placed directly beside each app's `ReplayButton` ("?" button): in Infra_App, inside the `extra` slot already passed to `InspectorDock` (`apps/infrashield-chaos/src/App.tsx`, the `extra={<ReplayButton onReplay={tour.replay} />}` prop — becomes `extra={<><ReplayButton .../><MuteToggle .../></>}`); in Necro_App, inside `TourChrome`'s `.tour-corner` cluster (`apps/necro-compiler-game/src/tour/TourChrome.tsx`, next to `<ReplayButton onClick={tour.replay} />`).

## Components and Interfaces

### Necro_App wiring (`apps/necro-compiler-game/src`)

| Event (Requirement) | Call site | Audio_Engine method |
|---|---|---|
| Ambience starts (5.1) | `useAudioEngine` mount effect / `primeOnGesture` | `startAmbience()` |
| Monster selected (5.2) | `App.tsx`'s `Dungeon` component, `game.select` passed to `DungeonScene`'s `onSelectEntity` — wrap the existing `game.select` callback (or add a `useEffect` on `state.selectedId` change) in `src/spells/useSpellGame.ts`'s `select` callback | `playSelect()` |
| Spell cast (5.3) | `src/spells/useSpellGame.ts`, `cast()` — on successful `dispatch({ type: "CAST_SUCCESS", ... })`, i.e. right after `caster.castSpell(spell)` resolves | `playCast()` |
| Cast monster disappears / purified (5.4) | Same `cast()` success path, once outcome confirms a visual transition to `"PURIFIED"` | `playPurify()` |
| Undo performed (5.5) | `src/spells/useSpellGame.ts`, `undo()` — on successful `dispatch({ type: "UNDO_SUCCESS" })` after `caster.rollbackLastSpell()` resolves | `playUndo()` |
| Spell cast on immune monster, no change (5.6) | `src/hud/MonsterCard.tsx` already distinguishes immune monsters via `entity.suggestedSpell === null`; `useSpellGame.cast()` returns early via `canCast` when `spell === null`, so the denied-thump call is added at the point `cast()` detects `target.entity.suggestedSpell === null` (the guard clause before `busyRef.current` check) | `playDenied()` |
| Load finishes (5.7) | `apps/necro-compiler-game/src/hud/load/useLoadDialog.ts`, `run()` — on `outcome.ok === true` leading to `{ status: "success" }`, or equivalently in `App.tsx`'s `Game` component where `LoadDialog`'s `onLoad`/`onLoadGitHub` resolve successfully | `playLoadComplete()` |

The spell-cast and undo success paths are the natural wiring points because `spellReducer`'s `CAST_SUCCESS`/`UNDO_SUCCESS` actions are the single place that confirms the adapter call actually succeeded (Requirement 5 ties sounds to outcomes, not to button presses).

### Infra_App wiring (`apps/infrashield-chaos/src`)

| Event (Requirement) | Call site | Audio_Engine method |
|---|---|---|
| Ambience starts (6.1) | `useAudioEngine` mount effect / `primeOnGesture` | `startAmbience()` |
| Fault injected (6.2) | `apps/infrashield-chaos/src/hooks/useCityController.ts`, `inject()` — after `adapter.injectFault(...)` resolves and `setLayout(next)` runs | `playFaultAlarm()` |
| Cascade reveal runs (6.3) | `apps/infrashield-chaos/src/components/city/faultTick.ts`, inside the `cascade.forEach(...)` block in the returned tick function — fire exactly when `item.revealed` flips from `false` to `true` in that frame; the per-reveal counter needed for the 12-tick cap lives alongside the `cascade` array built by `createFaultObjects` in `faultObjects.ts`, since Infra_App's own `CASCADE_STAGGER_S`-staggered reveal already indexes nodes in order | `playCascadeTick()`, capped at 12 calls per `buildFaultAnimation` invocation |
| Patch applied (6.4) | `apps/infrashield-chaos/src/hooks/useCityController.ts`, `applyPatch()` — after `adapter.applyMutation(...)` resolves and `setIsPatchApplied(true)` runs | `playPatchApplied()` |
| Patch rolled back (6.5) | `apps/infrashield-chaos/src/hooks/useCityController.ts`, `rollback()` — after `adapter.rollbackLastMutation()` resolves | `playPatchRollback()` |
| Bugfix spec generated or downloaded (6.6) | `apps/infrashield-chaos/src/components/panels/BugfixSpecButton.tsx`'s `handleGenerate()` (on reaching `setStatus("done")`) and `BugfixDownloadButton.tsx`'s `handleDownload()` (after `downloadTextFile(...)` is called without throwing) | `playBugfixClick()` |
| Load finishes (6.7) | `apps/infrashield-chaos/src/hooks/useRepoSwitch.ts`, `accept()` — when `outcome.ok` is true (covers both `load` and `loadGitHub`), and `backToSample()`'s success branch | `playLoadComplete()` |

Because `src/audio/` cannot import from `./adapter.ts` or vice versa, and `faultTick.ts`/`faultObjects.ts` are pure Three.js scene builders with no React, the Cascade_Tick call is injected via a callback parameter threaded through `BuildParams` (e.g. `onCascadeReveal?: () => void`) rather than importing the audio module into `faultTick.ts` directly — this keeps `src/components/city/` and `src/audio/` decoupled and lets `FaultOverlay.tsx` (which already calls `buildFaultAnimation` inside a `useEffect`, where hooks are legal) supply the real audio callback obtained from `useAudioEngine()`.

### Cascade_Tick cap (Requirement 6.3 / 8.7)

`buildFaultAnimation` (`useFaultAnimation.ts`) wraps the optional `onCascadeReveal` callback it receives in a small counting closure before passing it down to `createFaultTick`: the wrapper invokes the real callback only while a local counter is below 12, and always increments the counter, so a reveal of more than 12 nodes still emits exactly 12 `Cascade_Tick` calls — matching Requirement 8.7's test shape exactly (verify a reveal of >12 nodes emits exactly 12 ticks) without `faultTick.ts` itself needing to know about the cap.

## Data Models

```typescript
// muteStore.ts
export type MuteState = boolean;

export interface MuteStore {
  readonly value: MuteState;
  set(next: MuteState): void;
  subscribe(listener: (value: MuteState) => void): () => void;
}

// voices.ts
export interface EnvelopeSpec {
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly durationSeconds: number; // total voice lifetime, <= 2 for Effects
  readonly peakGain: number;        // <= 0.5 per voice
}

// faultTypes.ts addition (Infra_App only)
export interface BuildParams {
  // ...existing fields
  readonly onCascadeReveal?: () => void;
}
```

No new types cross the `./adapter` boundary; `Audio_Engine` methods take no arguments tied to domain data beyond what is already in scope at each call site (e.g. nothing from `CityNode`/`DungeonLayout` is passed into the audio layer — only the fact that an event occurred).

## Error Handling

- **No `AudioContext` support**: `engine.ts` checks `typeof window.AudioContext !== "function" && typeof window.webkitAudioContext !== "function"` once, caches the result, and short-circuits every method to a no-op without throwing (Requirement 1.5).
- **`localStorage` throws on read or write**: both `readMuteState` and `writeMuteState` wrap their single `localStorage` call in `try/catch`; on failure they fall back to the default/in-memory value and swallow the error — no `console.error`, no rethrow (Requirement 3.3, tested by Requirement 8.2).
- **A `play*` call arrives before the first Gesture or while muted**: the method returns synchronously; no `AudioContext`, oscillator, or `AudioBufferSourceNode` is constructed (Requirements 1.4, 2.8).
- **Effect scheduling errors** (e.g. a negative duration from a future palette change): voice factories validate inputs are finite and non-negative before calling `start`/`stop`; an invalid input is clamped rather than throwing, keeping the engine from ever crashing UI event handlers it's attached to.
- **Unmount during an in-flight Effect**: `dispose()` iterates all tracked live source nodes and calls `.stop()`/`.disconnect()` defensively inside a `try/catch` per node (a node already stopped can throw `InvalidStateError`), so one failed stop doesn't prevent cleanup of the rest.

## Testing Strategy

**Unit tests** (one `__tests__` folder inside each app's `src/audio/`):
- Mute persistence round-trip per app, using real `localStorage` (jsdom) — Requirement 8.1.
- `localStorage.getItem`/`setItem` mocked to throw — engine still functions, state falls back to default/in-memory — Requirement 8.2.
- `M` keydown (not focused in input/textarea/select) toggles `Mute_State`; a focused `<input>` suppresses the toggle; `MuteToggle` click toggles state and its `aria-pressed` attribute flips — Requirement 8.3.
- Each wired event (table above) triggers exactly one call to its mapped `Audio_Engine` method, using a `Mock_Context` that stands in for `AudioContext`/`OscillatorNode`/`AudioBufferSourceNode`/`GainNode` and records calls instead of producing sound — Requirement 8.4.
- No `Mock_Context` instance is constructed before the first simulated Gesture — Requirement 8.5.
- While `Mute_State` is muted, a `play*` call constructs no context, oscillator, or buffer source on the `Mock_Context` — Requirement 8.6.
- Infra_App: simulating a cascade reveal of 20 nodes asserts the counting wrapper invokes the tick callback exactly 12 times — Requirement 8.7.

**`Mock_Context` shape**: a lightweight object implementing just the subset of the `AudioContext` surface the engines use (`createOscillator`, `createGain`, `createBufferSource`, `createBuffer`, `createBiquadFilter`, `destination`, `currentTime`, `resume`, `close`, `state`), with each `create*` call pushing a record (type, timestamp) onto an array the test asserts against. It lives in each app's `src/audio/__tests__/mockContext.ts` (test-only, not shipped) and is injected into `createAudioEngine` via an optional `contextFactory` parameter that defaults to the real global constructor — the only seam the production code adds purely to make Requirement 8.4–8.6 testable.

**Property tests** (minimum 100 iterations each, using `fast-check`, already a devDependency in both apps — see `apps/infrashield-chaos/package.json`):
- Property 1 (cascade tick cap): generate a random non-negative integer node count, run the counting wrapper that many times, assert the number of forwarded calls equals `Math.min(count, 12)`.
- Property 2 (mute fallback): generate an arbitrary string excluding the literals `"true"` and `"false"`, seed a fake `localStorage` with it under the Storage_Key (and, as a separate case, an absent key), and assert `readMuteState` returns the default (unmuted) value.

Beyond these two, no further property-based tests are warranted: the remaining acceptance criteria in Requirements 1–8 are specific, deterministic event-to-call mappings, lifecycle/ordering guarantees with no meaningfully varying input, or two-valued (`Mute_State` true/false) checks already fully enumerated by example tests.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do.*

Almost every acceptance criterion in `requirements.md` resolves to a fixed, non-varying example (see Property Reflection below) rather than a universal statement over a large input domain, so this feature yields very few property candidates. The two criteria below have an actual varying input (an arbitrary reveal count, an arbitrary non-boolean stored string) where a universal property is meaningful and strictly stronger than a single boundary example.

### Property 1: Cascade tick count never exceeds the cap

For any non-negative number of revealed nodes in a cascade reveal, the number of `Cascade_Tick` calls emitted SHALL equal the smaller of that number and 12.

**Validates: Requirements 6.3, 8.7**

### Property 2: Invalid or absent stored mute values fall back to the default

For any string read from `localStorage` under the Storage_Key that is not exactly `"true"` or exactly `"false"` (including an absent key), the Audio_Engine SHALL initialize `Mute_State` to the default (unmuted) value.

**Validates: Requirements 2.1, 3.2, 3.4**

All remaining acceptance criteria are fixed, non-varying lifecycle/wiring/numeric-constant checks better suited to example-based tests — see the classification reference below for the full breakdown.

### Acceptance Criteria Classification Reference

Acceptance Criteria Testing Prework:

1.1 THE Audio_Engine SHALL create no AudioContext before the first Gesture
  Thoughts: Binary state (context exists / does not), checked once before any Gesture is simulated. No input varies.
  Classification: SMOKE / EXAMPLE

1.2–1.3 First vs. second Gesture create-vs-reuse
  Thoughts: Two concrete scenarios (first call, second call); nothing to randomize.
  Classification: EXAMPLE

1.4 Effect requested before first Gesture is discarded
  Thoughts: Single scenario; the specific Effect method called doesn't change the behavior under test (no context created).
  Classification: EXAMPLE

1.5 No AudioContext available → no-op
  Thoughts: Requires mocking the absence of the constructor; one scenario.
  Classification: EXAMPLE

2.1–2.8 Mute default, rendering, aria-pressed, toggle via click/key, silence/resume, no node creation while muted
  Thoughts: `Mute_State` is a boolean; both values and both transitions are fully enumerable by example tests. "Silences every playing Effect" is best verified by asserting `Master_Gain.gain.value` reaches 0, a single deterministic check, not a property over varying input.
  Classification: EXAMPLE

3.1, 3.3, 3.5 Persistence write, error swallowing, distinct keys per app
  Thoughts: Fixed, non-varying lifecycle/wiring checks (one write path, one thrown-error path, two literal key constants).
  Classification: EXAMPLE

2.1, 3.2, 3.4 Default Mute_State, read-on-init, invalid stored value falls back to default
  Thoughts: The input (the raw stored string) varies over a large space — any string other than exactly "true" or "false", or the key being absent entirely — and the required behavior ("fall back to default") must hold for all of them. Generating random strings and asserting the fallback is stronger than one hand-picked example like `"banana"`.
  Classification: PROPERTY — see Property 2

4.1–4.7 Master gain level, effect duration cap, cleanup on end, envelope shape, per-voice gain cap, unmount cleanup, independence from reduced-motion
  Thoughts: These are fixed numeric constants and lifecycle guarantees checked against the (mocked) node graph, not behavior that varies meaningfully across an input domain.
  Classification: EXAMPLE / INTEGRATION (node-graph shape assertions)

5.1–5.7, 6.1–6.7 Per-app event-to-sound wiring
  Thoughts: Each row is "event X triggers call Y exactly once" — a fixed 1:1 mapping with no varying input to generate. Testing with a Mock_Context confirms the wiring, not a universal property.
  Classification: EXAMPLE

6.3 / 8.7 Cascade reveal capped at 12 ticks
  Thoughts: The node count varies and the relationship (`ticks = min(count, 12)`) holds for every count, including counts far below, at, and above 12. This is worth a property test generating random counts in e.g. [0, 1000) and asserting the invariant, rather than only checking one or two hand-picked boundary values, since an off-by-one in the guard would only surface at count == 12 or 13.
  Classification: PROPERTY — see Property 1

7.1–7.7 Architecture isolation, line limits, no `any`, lint:boundaries
  Thoughts: Structural/static constraints, not runtime behavior.
  Classification: SMOKE (static checks / lint, not unit or property tests)

8.1–8.8 Test coverage meta-requirements
  Thoughts: These describe what the test suite itself must do; they are satisfied by the example/edge-case tests above plus `pnpm run typecheck` and the full suite passing.
  Classification: INTEGRATION

No testable properties were identified as warranting property-based testing; all acceptance criteria are covered by the example-based and edge-case tests described in the Testing Strategy.
