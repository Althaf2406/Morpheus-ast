# InfraShield 3D — Task Breakdown
## App 1: Cyber City Serverless Resilience Auditor & Chaos Simulator

Tasks are organized into parallel waves. Wave 1 must complete before Wave 2 begins.

---

## Wave 1 — Core Integration (Person A, Days 8–10)

- [x] **TASK-IS-01**: Extend `contracts.ts` with `FaultInjectionResult`, `BedrockPatchSuggestion`, `BugfixSpec`, and `SecurityScanResult` interfaces.
- [x] **TASK-IS-02**: Implement `ChaosFaultInjector` in `src/blast-radius/fault-injector.ts` supporting all four `FaultType` values.
- [x] **TASK-IS-03**: Implement `BedrockAdvisor` in `src/bedrock-advisor/index.ts` integrating Amazon Bedrock Claude 3 for patch synthesis.
- [x] **TASK-IS-04**: Implement `BugfixSpecGenerator` in `src/mutator/bugfix-generator.ts` producing conformant `bugfix.md` output.
- [x] **TASK-IS-05**: Implement `SecurityIngestionAdapter` in `src/security/ingestion.ts` mapping SonarQube/Snyk/AWS findings to `SecurityScanResult[]`.
- [x] **TASK-IS-06**: Scaffold `apps/infrashield-chaos/src/adapter.ts` wiring all five core functions to UI-consumable shapes.

## Wave 2 — UI & Visualization (Person B, Days 8–14)

- [ ] **TASK-IS-07**: Build Cyber City 3D force-directed graph component using `TopologyGraph` data from `adapter.ts`.
- [ ] **TASK-IS-08**: Build fault animation system (pulse, edge deletion, collapse, cascade highlight).
- [ ] **TASK-IS-09**: Build SRE Dashboard panel showing blast-radius score, Bedrock patch stream, and security findings.
- [ ] **TASK-IS-10**: Build Live Engine Inspector Toggle overlay.
- [ ] **TASK-IS-11**: Add Mirelo SFX / ElevenLabs SRE alarm audio for cascading failure events.
- [ ] **TASK-IS-12**: Add "Generate Bugfix Spec" button wired to `adapter.getBugfixSpec()`.

## Wave 3 — Integration QA (Shared, Days 15–16)

- [ ] **TASK-IS-13**: End-to-end test: load pre-loaded serverless repo → inject fault → verify blast-radius → download bugfix.md.
- [ ] **TASK-IS-14**: Accessibility and WebGL compatibility check across Chrome, Firefox, Safari.
- [ ] **TASK-IS-15**: Performance profiling — confirm 30 FPS at 500 nodes and 200 ms blast-radius budget.
- [ ] **TASK-IS-16**: Deploy to public URL (AWS CloudFront or Netlify) and verify no-login access.
