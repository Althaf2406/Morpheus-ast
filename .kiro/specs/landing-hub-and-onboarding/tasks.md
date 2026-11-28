# Implementation Plan: Landing Hub and Onboarding

## Overview

Language: TypeScript (strict, no `any`). The plan adds the static `site/` workspace package, then a duplicated `src/tour/` module in each app (Necro first, Infra mirrors it), then registers `site/` in the workspace, adds the root `build:site` script, updates the README, and runs full verification. Nothing under `packages/morpheus-ast-core/` changes. Tour UI code imports engine access only through `./adapter`, and every new or modified source file stays under 150 lines.

## Tasks

- [x] 1. Scaffold the `site/` workspace package
  - Create `site/package.json` (private, Vite, React, TypeScript, Vitest, fast-check, jsdom, Testing Library; scripts `dev`, `build`, `typecheck`, `test`), modelled on `apps/necro-compiler-game/package.json`
  - Create `site/tsconfig.json` with `strict: true`, `site/vite.config.ts` (including the Vitest config), and `site/index.html` with `<title>`, meta description, Open Graph tags and an SVG favicon link
  - Create `site/public/favicon.svg`
  - Add no dependency on `morpheus-ast-core` and no import from `apps/`
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 7.1, 7.2_

- [x] 2. Implement the Repo_Parser (`site/src/repoLink.ts`)
  - [x] 2.1 Implement `repoLink.ts`
    - Export `RepoSlug`, `parseRepoReference`, `formatRepoSlug`, `REPO_FORMAT_HINT`, `buildAppUrl`
    - Accept `owner/repo` and `github.com` URLs (trailing slash and `.git` suffix); return `null` for empty, whitespace or malformed input
    - `buildAppUrl` appends `?repo=owner/name` using URL-safe encoding that parses back to the same slug
    - _Requirements: 4.2, 4.3, 4.5, 4.6, 4.7, 4.10_

  - [x] 2.2 Write property test for the repo round-trip
    - **Property 1: Repo reference round-trip through the App URL**
    - File `site/src/repoLink.pbt.test.ts`, fast-check, at least 100 runs, owner/name over `[A-Za-z0-9._-]+`
    - **Validates: Requirements 4.2, 4.3, 4.5, 4.6, 4.10**

  - [x] 2.3 Write property test for invalid input
    - **Property 2: Invalid or empty Repo_Reference never navigates**
    - Generators include empty, whitespace-only and garbage strings; assert `parseRepoReference` returns `null`
    - **Validates: Requirements 4.7**

  - [x] 2.4 Write unit tests for parsing and URL building
    - File `site/src/repoLink.test.ts`: `owner/repo`, URL form, trailing slash, `.git`, empty/whitespace, malformed URLs, `buildAppUrl` output
    - _Requirements: 8.1, 8.2_

- [x] 3. Build the Landing_Site UI
  - [x] 3.1 Implement static sections
    - `components/Hero.tsx` ("MORPHEUS-AST: One skeleton. Two worlds." plus one explanatory sentence)
    - `components/HowItWorks.tsx` (exactly 3 steps with the specified wording)
    - `components/BuiltWithKiro.tsx` (specs, steering, hooks, property-based tests; links to https://github.com/Althaf2406/Morpheus-ast and `docs/KIRO_USAGE.md`)
    - `components/Footer.tsx` ("Kiroween 2026", "Skeleton Crew", "MIT license", "Althaf", "Bryan Carlie")
    - Use semantic elements (`header`, `main`, `section`, `footer`)
    - _Requirements: 2.1, 2.2, 5.1, 5.2, 5.3, 5.4, 6.1, 7.3_

  - [x] 3.2 Implement `WorldCard` and `worldCards.css`
    - `components/WorldCard.tsx` with `variant: "necro" | "infra"`, name, tagline and Enter_Button linking to https://necro-compiler.vercel.app or https://infrashield-3d.vercel.app
    - Necro style: dark brown and ember red, Cinzel; Infra style: near-black and cyan, monospace; art in CSS and inline SVG only
    - Hover animation, disabled under `prefers-reduced-motion: reduce`; side-by-side layout stacking on mobile widths
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [x] 3.3 Implement `TryYourCode`
    - `components/TryYourCode.tsx`: Repo_Input, "Open as dungeon" and "Open as city" buttons, three Example_Chips (`sindresorhus/p-limit`, `expressjs/cors`, `sindresorhus/ky`)
    - Valid input navigates to the app URL via `parseRepoReference` and `buildAppUrl`; invalid or empty input shows `REPO_FORMAT_HINT` inline with `role="alert"` and does not navigate
    - Chip activation sets the input value to the chip slug
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 3.4 Compose the page
    - `src/main.tsx`, `src/App.tsx` (Hero, two WorldCards, TryYourCode, HowItWorks, BuiltWithKiro, Footer), `src/site.css`
    - Add visible `:focus-visible` styles, WCAG AA contrast colors, and fixed-size layout to avoid layout shift
    - _Requirements: 3.1, 7.3, 7.4, 7.5, 7.6_

  - [x] 3.5 Write component unit tests
    - `site/src/components/__tests__/TryYourCode.test.tsx`: chip fills input, invalid submit shows message and does not navigate, valid submit navigates to the right URL
    - Fixed-content tests for Hero, WorldCards (names, taglines, links), HowItWorks, BuiltWithKiro, Footer
    - _Requirements: 2.1, 2.2, 3.4, 3.6, 3.7, 3.8, 4.7, 4.8, 4.9, 5.1, 5.3, 5.4, 6.1_

- [x] 4. Implement the Tour module in Necro_App (`apps/necro-compiler-game/src/tour/`)
  - [x] 4.1 Implement core modules
    - `tourState.ts` (pure reducer: START, NEXT, BACK, DISMISS; `INITIAL_TOUR_STATE`; NEXT at step 3 dismisses), `tourSteps.ts` (3 steps with copy per Requirement 10 and selectors `monster-target`, `spell-bar`, `load-controls`), `tourStorage.ts` (every localStorage call in try/catch, key `morpheus-tour-seen-necro`), `hubUrl.ts` (single `HUB_URL_CONSTANT = "https://morpheus-ast.vercel.app"`)
    - _Requirements: 9.2, 9.4, 9.5, 9.9, 10.1, 10.2, 10.3, 14.5, 15.1, 15.2, 16.3_

  - [x] 4.2 Implement `useTour.ts`
    - Wire reducer and storage; auto-START on mount unless seen; defer while `hasRepoParam && loadSummaryOpen`; Esc, Skip and completion dispatch DISMISS and call `markTourSeen`; expose `next`, `back`, `skip`, `replay`
    - _Requirements: 9.1, 9.5, 9.9, 12.2, 13.1, 13.2_

  - [x] 4.3 Implement UI components and add anchors
    - `TourOverlay.tsx` (portal; Spotlight from `getBoundingClientRect` when target is on screen, else Centered_Card; step indicator "n / 3"; Next/Back/Skip; `pointer-events: none` outside the card), `ReplayButton.tsx` ("?"), `SwitchWorldLink.tsx` (carries `?repo=` to https://infrashield-3d.vercel.app), `HubLink.tsx`, and gothic styling
    - Add `data-tour` attributes to `components/dungeon/DungeonScene.tsx` (`monster-target`), `hud/SpellBar.tsx` (`spell-bar`), `hud/load/RepoControls.tsx` (`load-controls`)
    - _Requirements: 9.3, 9.4, 9.6, 9.7, 9.8, 10.4, 12.1, 14.1, 14.3, 14.4_

  - [x] 4.4 Wire the Tour into the app
    - In the top-level app component call `useTour("necro", { hasRepoParam, loadSummaryOpen })` using existing repo-param and load-dialog state; render TourOverlay, ReplayButton, SwitchWorldLink, HubLink
    - Do not modify `adapter.ts` or import from `morpheus-ast-core`
    - _Requirements: 9.1, 12.1, 13.1, 13.2, 14.1, 14.4, 16.1, 16.2_

  - [x] 4.5 Write unit tests for state and storage
    - `__tests__/tourState.test.ts` (transitions) and `__tests__/tourStorage.test.ts` (Skip persists flag, throwing localStorage does not crash)
    - _Requirements: 9.5, 15.3, 15.4, 15.6_

  - [x] 4.6 Write unit tests for `useTour` and link components
    - First visit shows Tour, Esc dismisses and persists, Replay restarts at step 1, Switch world link carries `?repo=`, Hub link uses the constant
    - _Requirements: 9.1, 9.5, 12.2, 14.3, 14.4, 15.3, 15.5_

  - [x] 4.7 Write property test for step indicator
    - **Property 3: Tour step indicator matches total step count**
    - File `__tests__/tourIndicator.pbt.test.ts`
    - **Validates: Requirements 9.2, 9.3**

  - [x] 4.8 Write property test for Spotlight/Centered_Card choice
    - **Property 4: Spotlight/Centered_Card choice matches target presence**
    - File `__tests__/tourOverlay.pbt.test.ts`
    - **Validates: Requirements 9.6, 9.7**

  - [x] 4.9 Write property test for replay
    - **Property 5: Replay always restarts at step 1**
    - File `__tests__/tourReplay.pbt.test.ts`
    - **Validates: Requirements 12.2, 15.5**

  - [x] 4.10 Write property test for automatic display gating
    - **Property 6: Automatic Tour display is gated by repo param and Load_Summary**
    - File `__tests__/tourGating.pbt.test.ts`
    - **Validates: Requirements 9.1, 13.1, 13.2, 15.3**

  - [x] 4.11 Write property test for storage failures
    - **Property 7: Tour_Storage failures never throw and never crash the App**
    - File `__tests__/tourStorage.pbt.test.ts`
    - **Validates: Requirements 15.1, 15.2, 15.6**

- [x] 5. Implement the Tour module in Infra_App (`apps/infrashield-chaos/src/tour/`)
  - [x] 5.1 Implement core modules
    - Same shape as 4.1 with Infra copy (Requirement 11) and selectors `fault-toolbar`, `sre-panel`, `load-controls`; storage key `morpheus-tour-seen-infra`; its own `hubUrl.ts`
    - _Requirements: 9.2, 9.4, 9.5, 9.9, 11.1, 11.2, 11.3, 14.5, 15.1, 15.2, 16.3_

  - [x] 5.2 Implement `useTour.ts`
    - Same behavior as 4.2 with `appKey` `"infra"`
    - _Requirements: 9.1, 9.5, 9.9, 12.2, 13.1, 13.2_

  - [x] 5.3 Implement UI components and add anchors
    - Same components as 4.3 with cyber styling; SwitchWorldLink points to https://necro-compiler.vercel.app
    - Add `data-tour` attributes to `components/city/FaultToolbar.tsx` (`fault-toolbar`), `components/panels/SREDashboardPanel.tsx` (`sre-panel`), `components/load/LoadControls.tsx` (`load-controls`)
    - _Requirements: 9.3, 9.4, 9.6, 9.7, 9.8, 11.4, 12.1, 14.2, 14.3, 14.4_

  - [x] 5.4 Wire the Tour into the app
    - Call `useTour("infra", ...)` in `App.tsx` using existing repo-param and load-dialog state; render overlay, Replay_Button (beside the InspectorDock controls), SwitchWorldLink, HubLink
    - Do not modify `adapter.ts` or import from `morpheus-ast-core`
    - _Requirements: 9.1, 12.1, 13.1, 13.2, 14.2, 14.4, 16.1, 16.2_

  - [x] 5.5 Write unit tests for state and storage
    - Mirror of 4.5 under `apps/infrashield-chaos/src/tour/__tests__/`
    - _Requirements: 9.5, 15.3, 15.4, 15.6_

  - [x] 5.6 Write unit tests for `useTour` and link components
    - Mirror of 4.6
    - _Requirements: 9.1, 9.5, 12.2, 14.3, 14.4, 15.3, 15.5_

  - [x] 5.7 Write property test for step indicator
    - **Property 3: Tour step indicator matches total step count**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 5.8 Write property test for Spotlight/Centered_Card choice
    - **Property 4: Spotlight/Centered_Card choice matches target presence**
    - **Validates: Requirements 9.6, 9.7**

  - [x] 5.9 Write property test for replay
    - **Property 5: Replay always restarts at step 1**
    - **Validates: Requirements 12.2, 15.5**

  - [x] 5.10 Write property test for automatic display gating
    - **Property 6: Automatic Tour display is gated by repo param and Load_Summary**
    - **Validates: Requirements 9.1, 13.1, 13.2, 15.3**

  - [x] 5.11 Write property test for storage failures
    - **Property 7: Tour_Storage failures never throw and never crash the App**
    - **Validates: Requirements 15.1, 15.2, 15.6**

- [x] 6. Checkpoint - Ensure all tests pass
  - Run the Core_Package and both app test suites and `pnpm run lint:boundaries`; ensure all pass, ask the user if questions arise.

- [x] 7. Workspace registration, scripts, docs and final verification
  - [x] 7.1 Register `site/` in `pnpm-workspace.yaml`
    - Add `- "site"` to the `packages:` list, keep `allowBuilds`, then run `pnpm install` so `site/` dependencies resolve and the lockfile updates
    - _Requirements: 1.3_

  - [x] 7.2 Add the root `build:site` script
    - In root `package.json` add `"build:site": "pnpm --filter ./site run build"` (or the package name filter) without changing existing scripts
    - _Requirements: 1.7_

  - [x] 7.3 Update the README
    - Add a Landing_Site row to the "Live demos" table (https://morpheus-ast.vercel.app) and a short section stating the Landing_Site is not a third Skeleton Crew app
    - _Requirements: 1.6, 17.1_

  - [x] 7.4 Run full verification
    - Run `pnpm run lint:boundaries` (zero violations), `pnpm run typecheck` (Core_Package, both apps, `site/`), `pnpm run build:site`, and the test suites for `packages/morpheus-ast-core`, `apps/necro-compiler-game`, `apps/infrashield-chaos` and `site` (e.g. `pnpm --filter <pkg> exec vitest --run`); fix any failure
    - Confirm no file under `packages/morpheus-ast-core/` changed, no `any` was introduced, and every new or modified source file is under 150 lines
    - _Requirements: 1.4, 1.5, 16.2, 16.4, 16.5, 17.2, 17.3, 17.4_

## Notes

- Each task references specific requirements for traceability
- Site tests first run after task 7.1, because `site/` is registered in the workspace there
- Property tests validate universal correctness properties; unit tests validate examples and edge cases
- Visual qualities (contrast, focus style, layout shift, reduced motion) are checked manually, not by automated tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.3", "4.2", "4.3", "4.5", "4.9", "4.11", "5.2", "5.3", "5.5", "5.9", "5.11"] },
    { "id": 3, "tasks": ["3.4", "4.4", "4.6", "4.7", "4.8", "4.10", "5.4", "5.6", "5.7", "5.8", "5.10"] },
    { "id": 4, "tasks": ["3.5"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4"] }
  ]
}
```
