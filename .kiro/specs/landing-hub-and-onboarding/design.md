# Design Document

## Overview

This feature adds a static marketing hub (`site/`) and a duplicated first-run Tour module inside each of the two existing apps (`apps/necro-compiler-game/`, `apps/infrashield-chaos/`). Nothing changes in `packages/morpheus-ast-core/`. The Landing_Site is a third, independent Vite workspace package; it does not call the engine and has no adapter. Each app's Tour is a small set of files under `src/tour/` that reads real DOM anchors already present in the app (or added as `data-tour` attributes on existing elements) and renders a spotlight or centered card using React portals, driven by a tiny reducer and a try/catch-wrapped localStorage module.

## Architecture

```
site/                              new workspace package (static hub)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── repoLink.ts                Repo_Parser + App URL builder (pure)
    ├── components/
    │   ├── Hero.tsx
    │   ├── WorldCard.tsx
    │   ├── TryYourCode.tsx
    │   ├── HowItWorks.tsx
    │   ├── BuiltWithKiro.tsx
    │   └── Footer.tsx
    ├── worldCards.css
    └── site.css

apps/necro-compiler-game/src/tour/
├── tourSteps.ts                   the 3 Necro Tour_Steps (content + target selector)
├── tourState.ts                   reducer: step, visible, seen (pure)
├── tourStorage.ts                 try/catch localStorage wrapper
├── useTour.ts                     hook wiring reducer + storage + repo-param gating
├── TourOverlay.tsx                Spotlight / Centered_Card renderer
├── ReplayButton.tsx
├── SwitchWorldLink.tsx
├── HubLink.tsx
└── hubUrl.ts                      Hub_URL_Constant

apps/infrashield-chaos/src/tour/
└── (mirror of the above, Infra_App content and styling)
```

Both apps' Tour modules have the same shape but are independent files — per Requirement 16.3, no shared package is created.

### Why a duplicated Tour module instead of a shared package

| Option | Pros | Cons | Chosen |
|---|---|---|---|
| Shared `packages/tour-kit` | No duplication | New package violates "no new shared package" (Req 16.3); adds a cross-app dependency contrary to Skeleton Crew isolation | No |
| Duplicate `src/tour/` per app | Keeps apps fully independent; matches existing pattern of duplicated `useRepoParam`, `InspectorDock`, `useAdapterLoader` per app | ~6 small files duplicated | **Yes** |

The codebase already duplicates this kind of per-app infrastructure (e.g. `apps/*/src/engine/useAdapterLoader.ts`, `apps/*/src/*/useRepoParam.ts`, `apps/*/src/*/InspectorDock.tsx`), so a duplicated `src/tour/` is consistent with the existing convention.

### Where the Landing_Site fits

The Landing_Site is a plain Vite+React static site with no adapter and no engine access — it only builds URLs and reads form input. It is registered in `pnpm-workspace.yaml` (already a glob `apps/*`, `packages/*`; `site/` is added as an explicit third entry) and gets its own `package.json`, `tsconfig.json` (`strict: true`), and `vite.config.ts`, following the same shape as `apps/necro-compiler-game/`.

## Components and Interfaces

### Landing_Site: `repoLink.ts` (pure, no React)

```typescript
export interface RepoSlug {
  readonly owner: string;
  readonly name: string;
}

/** Accepts "owner/repo" or a github.com URL; returns null if the Repo_Reference is invalid. */
export function parseRepoReference(input: string): RepoSlug | null;

/** Formats a RepoSlug back into "owner/name". */
export function formatRepoSlug(slug: RepoSlug): string;

export const REPO_FORMAT_HINT: string; // shown inline on invalid/empty input, per Req 4.7

/** Builds the Necro_App or Infra_App URL with ?repo=owner/name appended. */
export function buildAppUrl(baseUrl: string, slug: RepoSlug): string;
```

`App.tsx` composes `Hero`, two `WorldCard`s, `TryYourCode` (owns the `Repo_Input`, the two buttons, inline error, and the 3 `Example_Chip`s and calls `parseRepoReference` / `buildAppUrl` on submit), `HowItWorks`, `BuiltWithKiro`, `Footer`. `WorldCard` takes `variant: "necro" | "infra"` and renders CSS/SVG art only (Req 3.9); `prefers-reduced-motion` is handled entirely in `worldCards.css` (Req 3.11), no JS branch needed.

### App Tour module (identical interface in both apps)

```typescript
// tourState.ts — pure reducer, no DOM, no storage
export interface TourState {
  readonly visible: boolean;
  readonly step: 1 | 2 | 3; // Req 9.2
}

export type TourAction =
  | { readonly type: "START" }     // Replay_Button or first-visit auto-show
  | { readonly type: "NEXT" }
  | { readonly type: "BACK" }
  | { readonly type: "DISMISS" };  // Esc, Skip, or completing step 3

export function tourReducer(state: TourState, action: TourAction): TourState;
export const INITIAL_TOUR_STATE: TourState; // { visible: false, step: 1 }
```

```typescript
// tourStorage.ts — the only module touching localStorage
export function hasSeenTour(appKey: "necro" | "infra"): boolean;  // never throws (Req 15.1, 15.2)
export function markTourSeen(appKey: "necro" | "infra"): void;    // never throws
```

```typescript
// useTour.ts — wires reducer + storage + repo-param deferral
export interface UseTourOptions {
  readonly hasRepoParam: boolean;      // true if ?repo= was present on load
  readonly loadSummaryOpen: boolean;   // Load_Summary dialog currently open
}
export function useTour(appKey: "necro" | "infra", options: UseTourOptions): {
  readonly state: TourState;
  readonly next: () => void;
  readonly back: () => void;
  readonly skip: () => void;
  readonly replay: () => void;
};
```

`useTour` auto-dispatches `START` on mount unless `hasSeenTour()` is true, deferring that dispatch while `hasRepoParam && loadSummaryOpen` (Req 13.1/13.2); it dispatches `DISMISS` (and calls `markTourSeen`) on Esc, Skip, or `NEXT` from step 3.

```typescript
// tourSteps.ts (per app, fixed content)
export interface TourStep {
  readonly title: string;
  readonly text: string;
  readonly targetSelector: string; // e.g. '[data-tour="monster"]'
}
export const TOUR_STEPS: readonly [TourStep, TourStep, TourStep];
```

`TourOverlay.tsx` renders, for the current step: if `document.querySelector(step.targetSelector)` is on screen, a `Spotlight` (a `position: fixed` ring computed from `getBoundingClientRect`) plus a card anchored next to it; otherwise a `Centered_Card` (Req 9.7). The overlay's backdrop uses `pointer-events: none` outside the card itself so the app stays interactive (Req 9.8) — unlike `load-backdrop` in `load.css`, which intentionally blocks the app.

### Real DOM anchors used as Tour targets

No new components are introduced for anchors; a `data-tour` attribute is added to three existing elements per app:

**Necro_App** (`apps/necro-compiler-game/src/`):
| Step | Target | File | Existing element |
|---|---|---|---|
| 1 | `[data-tour="monster-target"]` | `components/dungeon/DungeonScene.tsx` | the scene's root container (monsters are 3D, so the anchor is the canvas wrapper) |
| 2 | `[data-tour="spell-bar"]` | `hud/SpellBar.tsx:19` | `<div className="hud-panel hud-bar" role="region" aria-label="Spell bar">` |
| 3 | `[data-tour="load-controls"]` | `hud/load/RepoControls.tsx:9` | `<div className="hud-panel hud-repo-controls">` |

**Infra_App** (`apps/infrashield-chaos/src/`):
| Step | Target | File | Existing element |
|---|---|---|---|
| 1 | `[data-tour="fault-toolbar"]` | `components/city/FaultToolbar.tsx:35` | `<div role="toolbar" aria-label="Fault controls" style={TOOLBAR}>` |
| 2 | `[data-tour="sre-panel"]` | `components/panels/SREDashboardPanel.tsx` | the dashboard panel's root (contains `PatchController`) |
| 3 | `[data-tour="load-controls"]` | `components/load/LoadControls.tsx:19` | `<div role="toolbar" aria-label="Repository controls" style={BAR}>` |

Both apps mention the Inspector's `I` key in step 3's text only (Req 10.3/11.3), with no separate anchor needed since `InspectorDock` is not the step's target.

`ReplayButton.tsx` renders the "?" button (Req 12.1) next to each app's existing controls (Necro: inside `HudTitle`'s header area; Infra: inside the `InspectorDock`'s `DOCK` row), calling `replay()`.

`SwitchWorldLink.tsx` / `HubLink.tsx` read `window.location.search`'s `repo` param (if present) and append it to the other app's base URL (Necro ⇄ Infra) or to `HUB_URL` respectively; `hubUrl.ts` exports the single `HUB_URL_CONSTANT = "https://morpheus-ast.vercel.app"` per app (Req 14.5).

### Wiring into `App.tsx`

Each app's top-level `App.tsx`/`Dungeon`/`City` component adds `useTour(...)`, renders `<TourOverlay .../>`, `<ReplayButton onClick={replay} />`, `<SwitchWorldLink .../>`, `<HubLink .../>`, and passes `loadSummaryOpen` (derived from the existing `dialogOpen`/`state.status === "success"` state already present in `LoadDialog`) and `hasRepoParam` (from the existing `useRepoParam`/`param.initialRepo !== null` / `param.pendingRepo !== null` value) into `useTour`. No change to `adapter.ts` or any `morpheus-ast-core` file.

## Data Models

```typescript
// site/src/repoLink.ts
export interface RepoSlug {
  readonly owner: string;
  readonly name: string;
}

// apps/*/src/tour/tourState.ts
export interface TourState {
  readonly visible: boolean;
  readonly step: 1 | 2 | 3;
}
```

No persistent data model beyond the single localStorage key per app, e.g. `morpheus-tour-seen-necro` / `morpheus-tour-seen-infra`, storing the literal string `"1"`.

## Error Handling

- **Invalid/empty Repo_Reference** (Req 4.7): `parseRepoReference` returns `null`; `TryYourCode` shows `REPO_FORMAT_HINT` inline via `role="alert"` and does not navigate — mirrors the existing `REPO_FORMAT_ERROR` pattern in `apps/necro-compiler-game/src/engine/useRepoParam.ts`.
- **localStorage throws** (Req 15.1/15.2): `tourStorage.ts` wraps every `localStorage.getItem`/`setItem` call in `try/catch`; `hasSeenTour` returns `false` and `markTourSeen` is a no-op on failure, so the Tour still behaves correctly (shows once, just doesn't persist) instead of crashing the app.
- **Tour target not found** (Req 9.7): `TourOverlay` treats a `null` `querySelector` result as "show Centered_Card", not an error.
- **Boundary/type errors**: caught at build/lint time, not runtime — `pnpm run lint:boundaries`, `tsc --noEmit` (strict, no `any`), and the existing per-app `vitest run`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Repo reference round-trip through the App URL

For any valid `owner/repo` string (where `owner` and `repo` are non-empty strings of URL-safe characters), building an App URL from the parsed Repo_Slug and then parsing that URL's `repo` query parameter back SHALL yield the same `owner/name` slug.

**Validates: Requirements 4.2, 4.3, 4.5, 4.6, 4.10**

### Property 2: Invalid or empty Repo_Reference never navigates

For any string that is not a valid `owner/repo` form and not a valid `github.com` repository URL (including the empty string and strings composed only of whitespace), `parseRepoReference` SHALL return `null`, and the "Open as dungeon"/"Open as city" action SHALL produce no App URL and SHALL report the fixed accepted-format message.

**Validates: Requirements 4.7**

### Property 3: Tour step indicator matches total step count

For any step value in `{1, 2, 3}` and any App, the rendered step indicator text SHALL show that step number together with the fixed total of 3, and the Tour SHALL never expose a step value outside `{1, 2, 3}`.

**Validates: Requirements 9.2, 9.3**

### Property 4: Spotlight/Centered_Card choice matches target presence

For any Tour_Step and any boolean state of whether its `targetSelector` element is present and on screen in the DOM, the Tour SHALL render a Spotlight on that element when present and SHALL render that step as a Centered_Card without a Spotlight when absent, and in both cases all 3 Tour_Steps SHALL remain reachable via Next/Back.

**Validates: Requirements 9.6, 9.7**

### Property 5: Replay always restarts at step 1

For any current Tour_State (any step 1-3, any visibility, any persisted "seen" flag), activating the Replay_Button SHALL result in a Tour_State with `step = 1` and `visible = true`, regardless of the prior state.

**Validates: Requirements 12.2, 15.5**

### Property 6: Automatic Tour display is gated by repo param and Load_Summary

For any combination of (`hasRepoParam`, `loadSummaryOpen`, `hasSeenTour`), the App SHALL NOT automatically show the Tour while `hasRepoParam && loadSummaryOpen` is true, and SHALL automatically show the Tour starting at step 1 exactly when `hasSeenTour` is false and (`hasRepoParam` is false, or the Load_Summary has since closed).

**Validates: Requirements 9.1, 13.1, 13.2, 15.3**

### Property 7: Tour_Storage failures never throw and never crash the App

For any sequence of `hasSeenTour`/`markTourSeen` calls where the underlying `localStorage.getItem`/`setItem` throws an error on any call, `tourStorage.ts` SHALL catch every such error, SHALL NOT propagate an exception to the caller, and the App SHALL continue to render and accept input.

**Validates: Requirements 15.1, 15.2, 15.6**

## Testing Strategy

**Unit tests** (Vitest, one file per module, colocated `__tests__/` per existing convention):
- `site/src/repoLink.test.ts`: examples for `owner/repo` form, `github.com/owner/repo` URL form, trailing slash/`.git` suffix, empty/whitespace input, malformed URLs (Req 8.1, 8.2).
- `site/src/components/__tests__/TryYourCode.test.tsx`: Example_Chip click fills `Repo_Input` with its exact slug (Req 4.9); inline error message example on invalid submit.
- `apps/*/src/tour/__tests__/tourState.test.ts`: example-based transitions (START, NEXT from 1→2→3, BACK, DISMISS at any step, NEXT at step 3 dismisses).
- `apps/*/src/tour/__tests__/tourStorage.test.ts`: Skip persists the "seen" flag example (Req 9.5, 15.4); a mocked throwing `localStorage` does not crash (feeds Property 7).
- `apps/*/src/tour/__tests__/useTour.test.ts`: first-visit example, Esc-dismiss example.
- Fixed-content examples: Hero text, World_Card names/taglines/links, How-it-works 3 steps, Built-with-Kiro links, footer text, 3 Example_Chips values, Necro/Infra tour step copy (Req 2.1-2.2, 3.3-3.8, 5.1-5.4, 6.1, 9.2, 10.1-10.4, 11.1-11.4).

**Property-based tests** (fast-check, ≥100 runs each, tagged `Feature: landing-hub-and-onboarding, Property N: ...`):
- `site/src/repoLink.pbt.test.ts`: Property 1 (round-trip) and Property 2 (invalid input) — generators produce random valid `owner/name` pairs restricted to `[A-Za-z0-9._-]+`, and random invalid strings including empty/whitespace/garbage.
- `apps/*/src/tour/__tests__/tourIndicator.pbt.test.ts`: Property 3 over `fc.constantFrom(1, 2, 3)`.
- `apps/*/src/tour/__tests__/tourOverlay.pbt.test.ts`: Property 4 over `fc.boolean()` per step (target present/absent), rendered with a stub target element toggled in jsdom.
- `apps/*/src/tour/__tests__/tourReplay.pbt.test.ts`: Property 5 over arbitrary `TourState` (`fc.record({ visible: fc.boolean(), step: fc.constantFrom(1,2,3) })`).
- `apps/*/src/tour/__tests__/tourGating.pbt.test.ts`: Property 6 over `fc.record({ hasRepoParam: fc.boolean(), loadSummaryOpen: fc.boolean(), hasSeenTour: fc.boolean() })`.
- `apps/*/src/tour/__tests__/tourStorage.pbt.test.ts`: Property 7 over `fc.array(fc.constantFrom("get-throws", "set-throws", "ok"))` sequences applied to a mocked storage.

**Integration/smoke checks** (not PBT): `pnpm run lint:boundaries` zero violations; `tsc --noEmit` for `site/` and both apps; `pnpm run build:site`; manual check of contrast/focus-visible/no-layout-shift (Req 7.4-7.6) and hover/reduced-motion CSS (Req 3.10-3.11), since these are visual qualities with no pure-function return value to assert on.
