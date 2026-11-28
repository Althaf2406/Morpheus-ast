# Requirements Document

## Introduction

Judges need ONE entry URL that explains the project in 10 seconds and sends them into either app, plus a short first-run tour inside each app. This feature adds (1) a static landing site at `site/` in the monorepo root and (2) a first-run Tour in both Necro_App and Infra_App, together with "Switch world" and hub links. The Landing_Site is a pure marketing/hub page and is not a third Skeleton Crew app. The Tour code is duplicated per app as a small module; there is no new shared package and no change to the Core_Package.

## Glossary

- **Landing_Site**: The static Vite + React + TypeScript (strict) site located at `site/`.
- **Core_Package**: The workspace package at `packages/morpheus-ast-core/`.
- **Necro_App**: The gothic dungeon application at `apps/necro-compiler-game/`, deployed at https://necro-compiler.vercel.app.
- **Infra_App**: The cyber city application at `apps/infrashield-chaos/`, deployed at https://infrashield-3d.vercel.app.
- **App**: Either Necro_App or Infra_App.
- **Hero**: The top section of the Landing_Site containing the title and explanatory sentence.
- **World_Card**: One of the two large cards on the Landing_Site, one for Necro_App and one for Infra_App.
- **Enter_Button**: The button labelled "Enter" on a World_Card.
- **Repo_Input**: The single text input in the "Try it on your own code" section.
- **Repo_Reference**: A string identifying a GitHub repository, either in `owner/repo` form or as a `github.com` URL.
- **Repo_Slug**: The normalized `owner/name` form of a Repo_Reference.
- **Repo_Parser**: The Landing_Site module that parses and validates a Repo_Reference and builds App URLs.
- **Example_Chip**: A clickable chip that fills the Repo_Input with a sample Repo_Slug.
- **Tour**: The first-run guided tour inside an App, consisting of exactly 3 steps.
- **Tour_Step**: One step of the Tour, with a target UI element, a title and a text.
- **Tour_State**: The Tour module state: current step, visibility and the persisted "seen" flag.
- **Tour_Storage**: The localStorage-backed persistence of the Tour "seen" flag.
- **Spotlight**: A visual highlight around the real UI element targeted by a Tour_Step.
- **Centered_Card**: A Tour_Step card displayed in the middle of the screen without Spotlight.
- **Replay_Button**: The small "?" button in an App that restarts the Tour.
- **Load_Summary**: The summary dialog shown in an App after a repository load completes.
- **Switch_World_Link**: The small "Switch world" link in an App that points to the other App.
- **Hub_Link**: The link in an App that points back to the Landing_Site.
- **Hub_URL_Constant**: The single constant per App holding the Landing_Site URL, defaulting to https://morpheus-ast.vercel.app.
- **Adapter**: The file `apps/*/src/adapter.ts` of an App.
- **Boundary_Check**: The root script `pnpm run lint:boundaries`.

## Requirements

### Requirement 1: Landing site workspace

**User Story:** As a judge, I want a landing site in its own workspace folder, so that I have one entry URL for the whole project.

#### Acceptance Criteria

1. THE Landing_Site SHALL reside at `site/` in the monorepo root.
2. THE Landing_Site SHALL be built with Vite, React and TypeScript with `strict: true`.
3. THE pnpm workspace configuration SHALL include `site/`.
4. THE Landing_Site SHALL contain no import from `packages/morpheus-ast-core/` and no import from `apps/`.
5. THE Landing_Site SHALL contain no TypeScript type `any`.
6. THE Landing_Site README section SHALL state that the Landing_Site is not a third Skeleton Crew app.
7. THE root `package.json` SHALL define a script named `build:site` that builds the Landing_Site.

### Requirement 2: Hero

**User Story:** As a judge, I want a hero that explains the project at a glance, so that I understand it in 10 seconds.

#### Acceptance Criteria

1. THE Hero SHALL display the text "MORPHEUS-AST: One skeleton. Two worlds."
2. THE Hero SHALL display one sentence explaining that one headless code-analysis engine powers both Apps.

### Requirement 3: World cards

**User Story:** As a judge, I want two large cards side by side, so that I can choose which world to enter.

#### Acceptance Criteria

1. THE Landing_Site SHALL display two World_Cards side by side, the Necro_App card on the left and the Infra_App card on the right.
2. WHILE the viewport is of mobile width, THE Landing_Site SHALL stack the two World_Cards vertically.
3. THE Necro_App World_Card SHALL use a gothic style with dark brown and ember red colors and the Cinzel font.
4. THE Necro_App World_Card SHALL display the name "NECRO-COMPILER" and the line "Every monster is a real code smell. Every spell is a real refactor."
5. THE Infra_App World_Card SHALL use a cyber style with near-black and cyan colors and a monospace font.
6. THE Infra_App World_Card SHALL display the name "InfraShield 3D" and the line "Inject a fault. Watch the blast radius. Patch and roll back byte-exact."
7. THE Necro_App World_Card SHALL contain an Enter_Button linking to https://necro-compiler.vercel.app.
8. THE Infra_App World_Card SHALL contain an Enter_Button linking to https://infrashield-3d.vercel.app.
9. THE Landing_Site SHALL render World_Card art with CSS and SVG only, without external images.
10. WHEN a user hovers over a World_Card, THE Landing_Site SHALL play a hover animation.
11. WHILE the user's system setting is `prefers-reduced-motion: reduce`, THE Landing_Site SHALL disable the hover animation and other decorative animations.

### Requirement 4: Try it on your own code

**User Story:** As a judge, I want to open my own repository in either world, so that I can try the project on code I know.

#### Acceptance Criteria

1. THE Landing_Site SHALL display a "Try it on your own code" section with one Repo_Input.
2. THE Repo_Parser SHALL accept a Repo_Reference in `owner/repo` form.
3. THE Repo_Parser SHALL accept a Repo_Reference in the form of a `github.com` URL.
4. THE "Try it on your own code" section SHALL contain a button labelled "Open as dungeon" and a button labelled "Open as city".
5. WHEN the user activates "Open as dungeon" with a valid Repo_Reference, THE Landing_Site SHALL navigate to the Necro_App URL with the query parameter `?repo=owner/name`.
6. WHEN the user activates "Open as city" with a valid Repo_Reference, THE Landing_Site SHALL navigate to the Infra_App URL with the query parameter `?repo=owner/name`.
7. IF the user activates either button with an invalid or empty Repo_Reference, THEN THE Landing_Site SHALL display a clear inline message describing the accepted formats and SHALL NOT navigate.
8. THE "Try it on your own code" section SHALL display three Example_Chips with the values `sindresorhus/p-limit`, `expressjs/cors` and `sindresorhus/ky`.
9. WHEN the user activates an Example_Chip, THE Landing_Site SHALL set the Repo_Input value to the chip's Repo_Slug.
10. FOR ALL valid Repo_Slugs, THE Repo_Parser SHALL produce an App URL whose `repo` query parameter parses back to the same Repo_Slug.

### Requirement 5: How it works and Built with Kiro

**User Story:** As a judge, I want a short explanation of how the engine works and how Kiro was used, so that I can assess the project quickly.

#### Acceptance Criteria

1. THE Landing_Site SHALL display a "How it works" strip with exactly 3 steps: "Parse with the TypeScript Compiler API", "Analyze topology and findings" and "Mutate surgically with SHA-256 verified rollback".
2. THE Landing_Site SHALL display a "Built with Kiro" section that mentions specs, steering, hooks and property-based tests.
3. THE "Built with Kiro" section SHALL contain a link to https://github.com/Althaf2406/Morpheus-ast.
4. THE "Built with Kiro" section SHALL contain a link to `docs/KIRO_USAGE.md`.

### Requirement 6: Footer

**User Story:** As a judge, I want a footer with event and credit information, so that I know the context of the project.

#### Acceptance Criteria

1. THE Landing_Site footer SHALL display "Kiroween 2026", "Skeleton Crew", "MIT license" and the team names "Althaf" and "Bryan Carlie".

### Requirement 7: Page quality and accessibility

**User Story:** As a judge, I want the landing page to be well-formed and accessible, so that it previews and performs well.

#### Acceptance Criteria

1. THE Landing_Site SHALL define a page `<title>`, a meta description and Open Graph tags.
2. THE Landing_Site SHALL provide an SVG favicon.
3. THE Landing_Site SHALL use semantic HTML elements for its structure.
4. THE Landing_Site SHALL use text and background colors with a contrast ratio that meets WCAG AA.
5. WHEN an interactive element receives keyboard focus, THE Landing_Site SHALL display a visible focus style.
6. THE Landing_Site SHALL render without layout shift during page load.

### Requirement 8: Landing site tests

**User Story:** As a maintainer, I want unit and property tests for the landing site input logic, so that parsing and URL building stay correct.

#### Acceptance Criteria

1. THE Landing_Site SHALL include Vitest unit tests for Repo_Reference parsing and validation.
2. THE Landing_Site SHALL include Vitest unit tests for App URL building.
3. THE Landing_Site SHALL include a fast-check property test asserting that every valid `owner/repo` round-trips into the `?repo=` URL and back.

### Requirement 9: First-run tour behavior

**User Story:** As a first-time visitor, I want a short tour in each app, so that I learn the main interactions.

#### Acceptance Criteria

1. WHEN a user opens an App and Tour_Storage holds no "seen" flag, THE App SHALL display the Tour starting at step 1.
2. THE Tour SHALL consist of exactly 3 Tour_Steps in each App.
3. THE Tour SHALL display a step indicator showing the current step and the total of 3.
4. THE Tour SHALL provide Next and Back buttons.
5. WHEN the user presses Esc or activates "Skip", THE App SHALL dismiss the Tour and persist the "seen" flag in Tour_Storage.
6. WHEN a Tour_Step is displayed and its target element is on screen, THE App SHALL display a Spotlight on that element.
7. IF the target element of a Tour_Step is not on screen, THEN THE App SHALL display that Tour_Step as a Centered_Card without Spotlight and SHALL still present all 3 Tour_Steps.
8. THE Tour SHALL leave the underlying App interactive and SHALL NOT block user input to the App.
9. WHEN the user completes the third Tour_Step, THE App SHALL dismiss the Tour and persist the "seen" flag in Tour_Storage.

### Requirement 10: Necro tour steps

**User Story:** As a Necro_App player, I want tour steps that match the dungeon, so that I learn its core loop.

#### Acceptance Criteria

1. THE Necro_App Tour step 1 SHALL instruct the user to click a monster to inspect the code smell.
2. THE Necro_App Tour step 2 SHALL instruct the user to cast the spell with Enter and to undo with Cmd/Ctrl+Z.
3. THE Necro_App Tour step 3 SHALL instruct the user to Load their code to summon a dungeon from their own repository and SHALL mention the Inspector opened with the I key.
4. THE Necro_App Tour SHALL use the existing gothic visual style of Necro_App.

### Requirement 11: Infra tour steps

**User Story:** As an Infra_App user, I want tour steps that match the city, so that I learn its core loop.

#### Acceptance Criteria

1. THE Infra_App Tour step 1 SHALL instruct the user to pick a fault type and press Inject Fault.
2. THE Infra_App Tour step 2 SHALL instruct the user to read the blast radius and to apply or roll back the deterministic patch.
3. THE Infra_App Tour step 3 SHALL instruct the user to Load their code and Generate Bugfix Spec, and SHALL mention the Inspector opened with the I key.
4. THE Infra_App Tour SHALL use the existing cyber visual style of Infra_App.

### Requirement 12: Tour replay

**User Story:** As a user, I want to replay the tour, so that I can review it at any time.

#### Acceptance Criteria

1. THE App SHALL display a Replay_Button labelled "?".
2. WHEN the user activates the Replay_Button, THE App SHALL display the Tour starting at step 1, regardless of the "seen" flag.

### Requirement 13: Tour with repo parameter

**User Story:** As a user who arrives with a repository link, I want the tour to wait, so that it does not cover the load result.

#### Acceptance Criteria

1. WHEN an App is opened with the `?repo=` query parameter, THE App SHALL defer the automatic Tour until the Load_Summary is closed.
2. WHEN the Load_Summary is closed and Tour_Storage holds no "seen" flag, THE App SHALL display the Tour starting at step 1.

### Requirement 14: World switching and hub link

**User Story:** As a user, I want to jump between the two worlds and back to the hub, so that I can navigate the project easily.

#### Acceptance Criteria

1. THE Necro_App SHALL display a Switch_World_Link pointing to the Infra_App URL.
2. THE Infra_App SHALL display a Switch_World_Link pointing to the Necro_App URL.
3. WHERE the current page URL has a `?repo=` query parameter, THE Switch_World_Link SHALL carry the same `?repo=` value to the other App.
4. THE App SHALL display a Hub_Link pointing to the Hub_URL_Constant.
5. THE App SHALL define the Hub_URL_Constant in exactly one place, with the default value https://morpheus-ast.vercel.app.

### Requirement 15: Tour state tests and storage resilience

**User Story:** As a maintainer, I want the tour state to be tested and resilient, so that storage problems never break an app.

#### Acceptance Criteria

1. IF reading or writing localStorage throws an error, THEN THE Tour_Storage SHALL catch the error and THE App SHALL continue to operate without crashing.
2. THE Tour_Storage SHALL wrap every localStorage access in try/catch.
3. THE Tour_State module in each App SHALL have tests verifying that a first visit shows the Tour.
4. THE Tour_State module in each App SHALL have tests verifying that Skip persists the "seen" flag.
5. THE Tour_State module in each App SHALL have tests verifying that the Replay_Button restarts the Tour.
6. THE Tour_State module in each App SHALL have tests verifying that a storage failure does not crash the App.

### Requirement 16: Architecture compliance

**User Story:** As a maintainer, I want the tour to respect the Skeleton Crew architecture, so that boundaries and core stay intact.

#### Acceptance Criteria

1. THE Tour UI code in each App SHALL import only from `./adapter` for engine access, and SHALL import nothing from the Core_Package directly.
2. THE feature SHALL make no change to files under `packages/morpheus-ast-core/`.
3. THE Tour module (state, storage, navigation and theme) SHALL be implemented separately inside each App, without a new shared package.
4. THE feature SHALL contain no TypeScript type `any`.
5. THE feature SHALL keep every new or modified source file under 150 lines.

### Requirement 17: Documentation and verification

**User Story:** As a maintainer, I want documentation and verification, so that the feature is discoverable and proven.

#### Acceptance Criteria

1. THE README "Live demos" section SHALL list the Landing_Site.
2. WHEN the feature is complete, THE Boundary_Check SHALL pass with zero violations.
3. WHEN the feature is complete, typechecking SHALL pass for the Core_Package, both Apps and the Landing_Site.
4. WHEN the feature is complete, all tests of the Core_Package, both Apps and the Landing_Site SHALL pass.
