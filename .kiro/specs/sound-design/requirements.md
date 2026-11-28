# Requirements Document

## Introduction

Both applications (Necro_App at `apps/necro-compiler-game` and Infra_App at `apps/infrashield-chaos`) gain a runtime synthesized sound layer built on the Web Audio API. No audio files and no audio libraries are used. Each application owns its own `src/audio/` folder, imported directly by UI code. `adapter.ts` files and `packages/morpheus-ast-core/` remain unchanged. A single mute toggle per application controls both ambience and effects.

## Glossary

- **Audio_Engine**: The per-application module in `src/audio/` that owns the AudioContext, master gain, ambience, and effect synthesis.
- **Necro_App**: The application in `apps/necro-compiler-game`.
- **Infra_App**: The application in `apps/infrashield-chaos`.
- **Application**: Either Necro_App or Infra_App.
- **Gesture**: The first `pointerdown`, `keydown`, or `touchstart` event on the document.
- **Master_Gain**: The gain node that all Audio_Engine output passes through.
- **Mute_State**: A boolean indicating whether sound is muted. Default is unmuted.
- **Mute_Toggle**: The button in the UI, placed next to the existing "?" button, that changes Mute_State.
- **Ambience**: The looping background sound of an Application.
- **Effect**: A short synthesized sound tied to one UI event.
- **Storage_Key**: The localStorage key holding Mute_State, distinct per Application.
- **Cascade_Tick**: One blip emitted for a revealed node during an Infra_App cascade reveal.
- **Mock_Context**: The test double replacing AudioContext in unit tests.

## Requirements

### Requirement 1: Gesture-gated audio start

**User Story:** As a player or engineer, I want sound to start only after I interact with the page, so that the browser autoplay policy is respected and nothing plays unexpectedly.

#### Acceptance Criteria

1. THE Audio_Engine SHALL create no AudioContext before the first Gesture.
2. WHEN the first Gesture occurs, THE Audio_Engine SHALL create one AudioContext and resume it.
3. WHEN a second or later Gesture occurs, THE Audio_Engine SHALL reuse the existing AudioContext.
4. IF an Effect is requested before the first Gesture, THEN THE Audio_Engine SHALL discard the request without creating an AudioContext.
5. IF AudioContext is unavailable in the browser, THEN THE Audio_Engine SHALL treat every sound request as a no-op without throwing.

### Requirement 2: Mute toggle

**User Story:** As a user, I want to mute and unmute all sound with one control, so that I can silence the application quickly.

#### Acceptance Criteria

1. THE Mute_State SHALL default to unmuted when no stored value exists.
2. THE Application SHALL render the Mute_Toggle next to the "?" button using the style of that button.
3. THE Mute_Toggle SHALL expose an `aria-pressed` attribute equal to the current Mute_State and an accessible label naming its action.
4. WHEN the Mute_Toggle is clicked, THE Audio_Engine SHALL invert the Mute_State.
5. WHEN the M key is pressed and focus is not in a text input, textarea, or select, THE Audio_Engine SHALL invert the Mute_State.
6. WHEN the Mute_State becomes muted, THE Audio_Engine SHALL silence Ambience and every playing Effect.
7. WHEN the Mute_State becomes unmuted after a Gesture has occurred, THE Audio_Engine SHALL resume Ambience.
8. WHILE the Mute_State is muted, THE Audio_Engine SHALL create no AudioContext, oscillator, or buffer source for any Effect request.

### Requirement 3: Mute persistence

**User Story:** As a user, I want my mute choice remembered, so that I do not have to repeat it every visit.

#### Acceptance Criteria

1. WHEN the Mute_State changes, THE Audio_Engine SHALL write the new value to localStorage under the Storage_Key.
2. WHEN the Audio_Engine initializes, THE Audio_Engine SHALL read the Mute_State from localStorage under the Storage_Key.
3. IF a localStorage read or write throws, THEN THE Audio_Engine SHALL continue with the in-memory Mute_State without surfacing the error.
4. IF the stored value is neither `"true"` nor `"false"`, THEN THE Audio_Engine SHALL use the default Mute_State.
5. THE Necro_App and THE Infra_App SHALL use different Storage_Keys.

### Requirement 4: Audio quality and lifecycle

**User Story:** As a user, I want the sound to be quiet, clean, and well behaved, so that it never startles me or degrades the page.

#### Acceptance Criteria

1. THE Audio_Engine SHALL route all output through the Master_Gain set to -18 dB (linear gain 0.126).
2. THE Audio_Engine SHALL limit each Effect to a duration of at most 2 seconds, except Ambience.
3. WHEN an Effect ends, THE Audio_Engine SHALL stop and disconnect its oscillators and sources.
4. THE Audio_Engine SHALL apply an attack and release envelope to every Effect so that gain starts and ends at 0.
5. WHEN several Effects overlap, THE Audio_Engine SHALL keep the summed output at or below 1.0 by routing through the Master_Gain with per-voice gain at most 0.5.
6. WHEN the owning UI component unmounts, THE Audio_Engine SHALL stop all sources, remove the Gesture and M key listeners, and close the AudioContext.
7. THE Audio_Engine SHALL keep all sound behavior independent of the `prefers-reduced-motion` setting.

### Requirement 5: Necro sound palette

**User Story:** As a player of Necro_App, I want a gothic dungeon soundscape, so that the game feels atmospheric.

#### Acceptance Criteria

1. WHILE the Mute_State is unmuted and a Gesture has occurred, THE Necro_App Audio_Engine SHALL play a dungeon drone Ambience made of two detuned low sine or triangle oscillators and low-pass filtered noise wind modulated by a slow LFO.
2. WHEN a monster is selected, THE Necro_App Audio_Engine SHALL play one soft low whisper or thud Effect.
3. WHEN a spell is cast, THE Necro_App Audio_Engine SHALL play one rising shimmer Effect made of a noise sweep and bell partials.
4. WHEN a cast monster disappears, THE Necro_App Audio_Engine SHALL play one purify chime Effect.
5. WHEN an undo is performed, THE Necro_App Audio_Engine SHALL play one reversed falling shimmer Effect.
6. WHEN a spell is cast on an immune monster and no change results, THE Necro_App Audio_Engine SHALL play one dull denied thump Effect.
7. WHEN loading a source finishes, THE Necro_App Audio_Engine SHALL play one deep gong Effect.

### Requirement 6: InfraShield sound palette

**User Story:** As a user of Infra_App, I want a restrained server-room soundscape, so that the tool feels alive without distracting me.

#### Acceptance Criteria

1. WHILE the Mute_State is unmuted and a Gesture has occurred, THE Infra_App Audio_Engine SHALL play a server hum Ambience made of a sine oscillator between 50 Hz and 60 Hz and quiet filtered noise.
2. WHEN a fault is injected, THE Infra_App Audio_Engine SHALL play one two-tone square-wave alarm of 3 pulses followed by a low impact.
3. WHEN a cascade reveal runs, THE Infra_App Audio_Engine SHALL play one Cascade_Tick per revealed node, capped at 12 Cascade_Ticks per reveal.
4. WHEN a patch is applied, THE Infra_App Audio_Engine SHALL play one ascending two-note Effect.
5. WHEN a patch is rolled back, THE Infra_App Audio_Engine SHALL play one descending two-note Effect.
6. WHEN a bugfix spec is generated or downloaded, THE Infra_App Audio_Engine SHALL play one keyboard click burst Effect.
7. WHEN loading a source finishes, THE Infra_App Audio_Engine SHALL play one soft success chime Effect.

### Requirement 7: Architecture isolation

**User Story:** As a maintainer, I want the sound layer isolated from the core and adapters, so that the architecture rules remain intact.

#### Acceptance Criteria

1. THE Audio_Engine of each Application SHALL reside in that Application's `src/audio/` folder.
2. THE Application UI code SHALL import the Audio_Engine directly from `src/audio/`.
3. THE sound layer SHALL leave `apps/*/src/adapter.ts` and `packages/morpheus-ast-core/` unchanged.
4. THE sound layer SHALL add no runtime dependencies and no audio asset files.
5. THE sound layer SHALL contain no use of the TypeScript type `any`.
6. THE sound layer source files SHALL each contain at most 150 lines.
7. WHEN `pnpm run lint:boundaries` runs, THE repository SHALL report zero violations.

### Requirement 8: Test coverage

**User Story:** As a maintainer, I want automated tests for the sound layer, so that regressions in mute behavior and event wiring are caught.

#### Acceptance Criteria

1. THE test suite SHALL verify that Mute_State persists to and restores from localStorage in each Application.
2. THE test suite SHALL verify that the Audio_Engine continues without error when localStorage throws on read and on write.
3. THE test suite SHALL verify that the M key toggles Mute_State and that a click on the Mute_Toggle toggles Mute_State and updates `aria-pressed`.
4. THE test suite SHALL verify, using a Mock_Context, that each wired event triggers exactly one Effect call.
5. THE test suite SHALL verify, using a Mock_Context, that no AudioContext is constructed before the first Gesture.
6. THE test suite SHALL verify, using a Mock_Context, that no AudioContext, oscillator, or buffer source is created for an Effect request while muted.
7. THE test suite SHALL verify that an Infra_App cascade reveal of more than 12 nodes emits exactly 12 Cascade_Ticks.
8. WHEN `pnpm run typecheck` and the full test suite run, THE repository SHALL report zero errors and zero failures.
