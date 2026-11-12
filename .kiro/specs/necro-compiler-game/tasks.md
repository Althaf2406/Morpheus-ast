# NECRO-COMPILER — Task Breakdown
## App 2: 3D Gothic Dungeon Crawler & Codebase Exorcist

---

## Wave 1 — Core Integration (Person A, Days 8–10)

- [x] **TASK-NC-01**: Confirm `contracts.ts` exposes `applySurgicalMutation()`, `rollbackMutation()`, `generateBedrockPatch()`, and `runSecurityScan()` needed by this app.
- [x] **TASK-NC-02**: Verify `TopologyGraph.nodes` carries `cyclomaticComplexity`, `hasCircularDep`, and `unusedVariables` fields required for dungeon mapping.
- [x] **TASK-NC-03**: Scaffold `apps/necro-compiler-game/src/adapter.ts` with dungeon-mapping transform functions that convert `TopologyGraph` → `DungeonLayout`.
- [x] **TASK-NC-04**: Confirm `SecurityScanResult` carries `severity` and `category` fields for monster-type mapping.

## Wave 2 — UI & Dungeon (Person B, Days 8–14)

- [ ] **TASK-NC-05**: Build Gothic Dungeon 3D force-directed room layout from `DungeonLayout` data in `adapter.ts`.
- [ ] **TASK-NC-06**: Build monster rendering system (Poltergeist Demon, Zombie Variable, Shadow Lint Ghost) with GLSL shaders.
- [ ] **TASK-NC-07**: Build Refactoring Spell cast UI in `src/spells/` wired to `adapter.castSpell()`.
- [ ] **TASK-NC-08**: Build Undo Spell button wired to `adapter.rollbackLastSpell()`.
- [ ] **TASK-NC-09**: Build Bedrock "Holy Incantation" hint overlay.
- [ ] **TASK-NC-10**: Build Live Engine Inspector Toggle showing mutation diff.
- [ ] **TASK-NC-11**: Add Mirelo SFX / ElevenLabs Gothic horror audio (thunder, whispers, holy chants).

## Wave 3 — Integration QA (Shared, Days 15–16)

- [ ] **TASK-NC-12**: End-to-end test: load repo → verify dungeon rooms → cast spell → confirm source file mutated → undo → confirm rollback.
- [ ] **TASK-NC-13**: Boss room test: verify Complexity ≥ 15 functions render as boss rooms.
- [ ] **TASK-NC-14**: Performance profiling — 30 FPS at 300 rooms, 500 ms spell cast budget.
- [ ] **TASK-NC-15**: Deploy to public URL and verify no-login access.
