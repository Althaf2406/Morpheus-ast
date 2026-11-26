# Requirements Document

## Introduction

InfraShield renders the Cyber City from files under `apps/infrashield-chaos/src/mock/`. This feature migrates `apps/infrashield-chaos/` to the real `morpheus-ast-core` engine, equivalent to `apps/necro-compiler-game/`. The patterns come from `.kiro/specs/necro-real-engine-integration` and `.kiro/specs/deterministic-remediation`. The app reaches the engine only through `apps/infrashield-chaos/src/adapter.ts`. The team approved editing the Person A part of `adapter.ts`.

The app lazy-loads the adapter, builds the city from the real topology graph with a deterministic force-directed layout, lets the user select a target building and a fault type, fills a deterministic remediation patch, and applies and rolls back that patch in memory on the adapter's virtual copy of the sample repository.

The work is limited to `apps/infrashield-chaos/`, `.kiro/specs/infrashield-chaos/tasks.md` and this spec. Files under `packages/` and `apps/necro-compiler-game/` are not edited, and no commit is made.

## Glossary

- **InfraShield_App**: The React and Three.js application in `apps/infrashield-chaos/`.
- **Adapter**: The `InfraShieldAdapter` class in `apps/infrashield-chaos/src/adapter.ts`, the single composition root of InfraShield_App.
- **Core_Engine**: The `morpheus-ast-core` engine created by `createEngine()` and typed by `contracts.ts`.
- **Sample_Repository**: The repository returned by the engine's `getSampleRepository()` and loaded by the Adapter as virtual files.
- **Virtual_Copy**: The in-memory copy of the Sample_Repository source text held by the Adapter. It is never written to disk.
- **Healthy_State**: The Virtual_Copy equal to the original Sample_Repository with no active fault, patch or mutation.
- **Cyber_City**: The 3D scene in which each function is a building and each call edge is a road.
- **City_Layout**: The `CyberCityLayout` value returned by the Adapter.
- **Layout_Solver**: The pure module that computes node positions on the flat X-Z plane for the Cyber_City. It replaces the 4x3 grid in `useCityPositions`.
- **Loading_Screen**: The full-view screen shown while the Adapter module loads and the initial City_Layout is computed.
- **Error_Panel**: The full-view panel that shows an error message and a Retry button.
- **SRE_Style**: The existing visual style of InfraShield_App: cyan, amber and red palette with a monospace font.
- **Selected_Building**: The building the user selected by click, or the default target defined in Requirement 4.
- **Building_Tooltip**: The tooltip shown on hover with function name, file, complexity and centrality.
- **Fault_Selector**: The dropdown next to the Inject Fault button that selects a `FaultType`.
- **Fault_Type**: One of the four `FaultType` values `LATENCY`, `NETWORK_FAILURE`, `EXTREME_PAYLOAD` and `UNCAUGHT_EXCEPTION`.
- **Deterministic_Patch**: A `BedrockPatchSuggestion` built by the Adapter from `engine.planRemediation` with `modelId` equal to `"deterministic"`.
- **AI_Patch**: A `BedrockPatchSuggestion` returned by Bedrock, with a `modelId` other than `"deterministic"`.
- **AI_Patch_Card**: The panel that displays the current patch.
- **Bugfix_Spec**: The markdown produced by the Adapter's `generateBugfixFile()`.
- **Patch_Controller**: The dashboard controls Apply Patch and Rollback.
- **Mock_Files**: The files under `apps/infrashield-chaos/src/mock/`.
- **Render_Loop**: The `requestAnimationFrame` loop that drives the Cyber_City animation.
- **Reduced_Motion**: The browser setting matched by the media query `prefers-reduced-motion: reduce`.
- **Boundary_Linter**: The command `pnpm run lint:boundaries`.

## Requirements

### Requirement 1: Lazy Adapter Loading, Loading Screen and Error Panel

**User Story:** As an SRE, I want the app to load the engine on demand and report failures with a retry, so that the first paint is fast and errors are recoverable.

#### Acceptance Criteria

1. WHEN InfraShield_App starts, THE InfraShield_App SHALL load the Adapter module through a dynamic `import()` of `./adapter`.
2. WHEN the Adapter module has loaded, THE InfraShield_App SHALL call `createInfraShieldAdapter()` and then `loadSampleRepository()` and render the returned City_Layout as the initial layout.
3. WHILE the Adapter module is loading or `loadSampleRepository()` is pending, THE InfraShield_App SHALL display the Loading_Screen in SRE_Style.
4. IF the dynamic import or `loadSampleRepository()` fails, THEN THE InfraShield_App SHALL display the Error_Panel in SRE_Style with the error message and a Retry button.
5. WHEN the user activates Retry, THE InfraShield_App SHALL display the Loading_Screen and repeat the loading sequence of criteria 1 and 2.
6. THE InfraShield_App SHALL import data and types only from `./adapter` in every file other than `adapter.ts`.
7. THE Adapter SHALL import only `contracts` and `src/index` from `packages/morpheus-ast-core/src/`.

### Requirement 2: Deterministic Force-Directed City Layout

**User Story:** As an SRE, I want a dense and stable layout for any number of functions, so that I can recognise parts of the service between runs and see the whole city.

#### Acceptance Criteria

1. THE Layout_Solver SHALL compute the position of every node of a City_Layout with a force-directed algorithm for any node count, including zero.
2. THE Layout_Solver SHALL place every node on the flat X-Z plane with a Y coordinate of 0 for the building base.
3. THE Layout_Solver SHALL derive each building height from the `complexity` of the corresponding node.
4. THE Layout_Solver SHALL compute positions without calling `Math.random`.
5. WHEN the same City_Layout is supplied twice, THE Layout_Solver SHALL return identical positions.
6. WHEN the same node set is supplied after an unrelated fault state change, THE Layout_Solver SHALL return the same positions, so that buildings do not move on fault, patch or rollback.
7. THE Layout_Solver SHALL return a finite number for every coordinate of every node.
8. THE Layout_Solver SHALL return positions at which no two building footprints overlap.
9. THE Layout_Solver SHALL return a layout whose footprint area is at most 4 times the sum of the building footprint areas, for a City_Layout of at least 10 nodes.
10. WHEN a City_Layout is rendered or the viewport is resized, THE Cyber_City SHALL set the camera position and target so that every building is inside the view frustum.
11. THE InfraShield_App SHALL include fast-check property-based tests for determinism, no overlap and finite positions of the Layout_Solver.

### Requirement 3: Target Selection and Tooltip

**User Story:** As an SRE, I want to hover and click buildings, so that I can inspect a function and choose the fault target.

#### Acceptance Criteria

1. WHEN the pointer hovers a building, THE Cyber_City SHALL highlight that building.
2. WHEN the pointer hovers a building, THE InfraShield_App SHALL display the Building_Tooltip with the function name, file, complexity and centrality of that node.
3. WHEN the pointer leaves a building, THE Cyber_City SHALL remove the highlight and THE InfraShield_App SHALL hide the Building_Tooltip.
4. WHEN the user clicks a building, THE InfraShield_App SHALL set that building as the Selected_Building and display a selection highlight distinct from the hover highlight.
5. WHEN the user clicks a building that is already the Selected_Building, THE InfraShield_App SHALL keep that building selected.

### Requirement 4: Fault Injection on the Selected Building

**User Story:** As an SRE, I want to attack the selected building with a chosen fault type and reset afterwards, so that I can compare how failures cascade.

#### Acceptance Criteria

1. THE Fault_Selector SHALL list exactly the four Fault_Type values and no others.
2. THE Fault_Selector SHALL be positioned next to the Inject Fault button.
3. WHEN the user activates Inject Fault, THE InfraShield_App SHALL call `injectFault` on the Adapter with the selected Fault_Type and the id of the Selected_Building.
4. WHILE no building is selected, THE InfraShield_App SHALL use the node with the highest centrality as the target of Inject Fault.
5. WHEN `injectFault` resolves, THE Cyber_City SHALL mark the faulted node as faulted and each affected node as affected.
6. IF `injectFault` rejects, THEN THE InfraShield_App SHALL display the error message and keep the previous City_Layout.
7. WHEN the user activates Reset, THE InfraShield_App SHALL reload the Healthy_State from the Adapter, clear the active fault, the patch and the Selected_Building, and render the returned City_Layout.

### Requirement 5: Dashboard and Security Findings from Real Data

**User Story:** As an SRE, I want the dashboard and findings to show engine results, so that I can trust the numbers.

#### Acceptance Criteria

1. THE InfraShield_App SHALL populate the SRE dashboard from `getSREDashboard()` on the Adapter.
2. WHEN the City_Layout changes, THE InfraShield_App SHALL refresh the security findings card from the real `securityFindings` of the City_Layout.
3. WHEN a fault result exists, THE InfraShield_App SHALL display the blast-radius score and cascade path of that result.
4. THE InfraShield_App SHALL not import or read any Mock_Files at runtime.
5. IF a test uses a Mock_Files module, THEN THE InfraShield_App SHALL keep that module only under a test folder.
6. THE InfraShield_App SHALL not keep a Mock_Files module that no test or source file uses.

### Requirement 6: Deterministic Patch Without AI

**User Story:** As an SRE, I want a patch suggestion even when no AI service is reachable, so that remediation works offline and in the browser.

#### Acceptance Criteria

1. WHEN `injectFault` resolves, THE Adapter SHALL call `engine.planRemediation` for the target function with `errorCause: true` for the Sample_Repository and store a Deterministic_Patch in `lastPatch`.
2. THE Adapter SHALL set `modelId` of a Deterministic_Patch to `"deterministic"`.
3. THE Adapter SHALL write a Deterministic_Patch rationale that states that the patch comes from rule-based remediation and not from an AI model.
4. WHERE Bedrock is available, THE Adapter SHALL request an AI_Patch after storing the Deterministic_Patch.
5. IF the Bedrock request fails, including in a browser environment, THEN THE Adapter SHALL keep the Deterministic_Patch and SHALL neither throw an error to the UI nor write to the console.
6. IF a Bedrock answer arrives for a fault that is no longer the active fault, THEN THE Adapter SHALL discard that answer.
7. THE AI_Patch_Card SHALL display a label that distinguishes a Deterministic_Patch from an AI_Patch, derived from `modelId`.
8. WHEN the user activates Generate Bugfix Spec, THE InfraShield_App SHALL build the Bugfix_Spec from the current patch in `lastPatch`.
9. WHEN the user activates Download, THE InfraShield_App SHALL offer the `fileName` and `content` returned by `generateBugfixFile()` as a file download.
10. WHILE no fault has been injected, THE InfraShield_App SHALL disable Generate Bugfix Spec and Download.
11. THE InfraShield_App SHALL include a test that exercises the Download flow from injected fault to `generateBugfixFile()` content, as evidence for TASK-IS-13.

### Requirement 7: Apply Patch and Rollback

**User Story:** As an SRE, I want to apply and undo a patch safely, so that I can watch the city recover without touching my files.

#### Acceptance Criteria

1. THE Patch_Controller SHALL provide an Apply Patch button and a Rollback button in the SRE dashboard.
2. WHEN the user activates Apply Patch, THE Adapter SHALL call `applyMutation` with the splices of the current patch on the Virtual_Copy.
3. WHEN `applyMutation` resolves, THE Adapter SHALL re-analyze the Virtual_Copy and THE Cyber_City SHALL render the recovered state of the returned City_Layout.
4. WHEN the user activates Rollback, THE Adapter SHALL call `rollbackLastMutation`, re-analyze the Virtual_Copy and THE Cyber_City SHALL render the returned City_Layout.
5. WHEN Rollback completes, THE Adapter SHALL hold a Virtual_Copy whose source text is byte-identical to the source text before Apply Patch.
6. THE Adapter SHALL perform Apply Patch, Rollback and Reset on the Virtual_Copy in memory and SHALL perform no file system write.
7. WHILE no patch exists, THE Patch_Controller SHALL disable Apply Patch.
8. WHILE no patch has been applied, THE Patch_Controller SHALL disable Rollback.
9. IF `applyMutation` or `rollbackLastMutation` rejects, THEN THE Adapter SHALL leave the Virtual_Copy unchanged and THE InfraShield_App SHALL display the error message.
10. THE InfraShield_App SHALL include an integration test that runs in the Node environment with `createInfraShieldAdapter()` and verifies the sequence load, inject, patch, apply, source change, rollback, source byte-identical to the original.

### Requirement 8: Rendering and Accessibility

**User Story:** As a viewer, I want smooth and accessible rendering, so that the demo stays readable on any device.

#### Acceptance Criteria

1. THE InfraShield_App SHALL drive the whole Cyber_City animation from a single Render_Loop.
2. WHEN the Cyber_City unmounts, THE InfraShield_App SHALL cancel the Render_Loop and dispose every geometry, material and texture it created.
3. WHILE Reduced_Motion is active, THE Cyber_City SHALL show faulted, affected and recovered states as static color changes without pulse animation or camera glide.
4. THE Cyber_City SHALL render nodes and edges with `InstancedMesh`.
5. WHILE the City_Layout contains 500 nodes, THE Cyber_City SHALL sustain at least 30 frames per second.

### Requirement 9: Repository Governance

**User Story:** As a maintainer, I want the code to follow repository governance, so that boundary and style checks pass.

#### Acceptance Criteria

1. THE InfraShield_App SHALL not use the TypeScript type `any`.
2. THE InfraShield_App SHALL keep each file under `src/components/` and `src/App.tsx` below 150 lines.
3. THE InfraShield_App SHALL use only group comments inside components.
4. THE InfraShield_App SHALL not contain a source file, export, import, type or function that has no consumer.
5. THE InfraShield_App SHALL leave every file under `packages/` and `apps/necro-compiler-game/` unmodified.
6. THE InfraShield_App SHALL create no git commit.
7. THE InfraShield_App SHALL leave `.kiro/specs/infrashield-real-engine-integration/.config.kiro` unmodified.
8. WHEN `pnpm run lint:boundaries` runs at the repository root, THE Boundary_Linter SHALL report zero violations.

### Requirement 10: Task Tracking

**User Story:** As a maintainer, I want the InfraShield task list to match reality, so that progress is trustworthy.

#### Acceptance Criteria

1. WHEN a task in `.kiro/specs/infrashield-chaos/tasks.md` is fully completed by this feature, THE implementer SHALL mark that task as completed.
2. IF a task in `.kiro/specs/infrashield-chaos/tasks.md` is not fully completed by this feature, THEN THE implementer SHALL leave its status unchanged.
3. WHEN the Download flow of Requirement 6 and its test pass, THE implementer SHALL treat that result as evidence for TASK-IS-13 and mark TASK-IS-13 completed only if every element of that task is verified.

### Requirement 11: Final Verification

**User Story:** As a maintainer, I want a defined verification pass, so that I know the integration is complete and nothing else broke.

#### Acceptance Criteria

1. WHEN the implementation finishes, THE implementer SHALL run the typecheck of `apps/infrashield-chaos` and obtain zero errors.
2. WHEN the implementation finishes, THE implementer SHALL run the tests of `apps/infrashield-chaos` and obtain zero failures.
3. WHEN the implementation finishes, THE implementer SHALL run the production build of `apps/infrashield-chaos` and record the size of each emitted chunk, including the lazily loaded Adapter chunk.
4. WHEN the implementation finishes, THE implementer SHALL run the tests of `packages/morpheus-ast-core` and obtain zero failures.
5. WHEN the implementation finishes, THE implementer SHALL run the typecheck and tests of `apps/necro-compiler-game` and obtain zero errors and zero failures.
6. WHEN the implementation finishes, THE implementer SHALL run `pnpm run lint:boundaries` and obtain zero violations.
7. WHEN the implementation finishes, THE implementer SHALL re-read every changed file.
8. WHEN the implementation finishes, THE implementer SHALL run `wc -l` on `src/components/**` and `src/App.tsx` of `apps/infrashield-chaos` and confirm that every count is below 150.
