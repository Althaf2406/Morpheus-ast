# NECRO-COMPILER — Design Document
## App 2: 3D Gothic Dungeon Crawler & Codebase Exorcist

---

## 1. Overview

NECRO-COMPILER is a browser-based, fully functional 3D Gothic Dungeon Crawler where the
dungeon is a live representation of a real source code repository. The player exorcises code
quality problems (monsters) by casting Refactoring Spells — which are real, surgical AST
mutations executed against the actual source files via `morpheus-ast-core`.

**All data flow is strictly unidirectional:**
```
contracts.ts (core output) → adapter.ts (App 2 transform) → React/Three.js UI
```

No code inside `apps/necro-compiler-game/` may import from `packages/morpheus-ast-core/`
beyond `contracts.ts`.

---

## 2. Architecture

### 2.1 Layer Stack

```
┌─────────────────────────────────────────────────┐
│  Three.js Gothic Dungeon Renderer  (Person B)   │
│  Monster Shader System             (Person B)   │
│  Refactoring Spell UI / spells/    (Person B)   │
│  Live Engine Inspector Toggle      (Person B)   │
├─────────────────────────────────────────────────┤
│  adapter.ts   ← contracts.ts only   (Shared)    │
├─────────────────────────────────────────────────┤
│  packages/morpheus-ast-core  (Person A)         │
│  ├── parser/                                    │
│  ├── topology/                                  │
│  ├── blast-radius/                              │
│  ├── mutator/                                   │
│  └── bedrock-advisor/  (Week 2)                 │
└─────────────────────────────────────────────────┘
```

### 2.2 AST-to-Dungeon Mapping

The dungeon layout is a direct, deterministic transformation of the `TopologyGraph`:

| AST Concept                        | Dungeon Element                              |
|------------------------------------|----------------------------------------------|
| Module                             | Castle wing / sector                         |
| Function (Cyclomatic Complexity ≤ 5)| Small room                                  |
| Function (Complexity 6–14)         | Medium room with traps                       |
| Function (Complexity ≥ 15)         | Boss room with Poltergeist Demon             |
| Call edge                          | Corridor between rooms                       |
| Circular dependency                | Infinite Loop Curse corridor (loops back)    |
| Unused variable                    | Zombie Variable entity                       |
| Uncaught exception / security hole | Poltergeist Demon NPC                        |

### 2.3 Refactoring Spell → Surgical AST Mutation

When the player casts a Refactoring Spell on a monster:

1. `adapter.ts` calls `applySurgicalMutation()` with the target `SpliceRange`.
2. `morpheus-ast-core` applies the Surgical Line-Range AST Splice.
3. The source file on disk is rewritten with the patch applied.
4. The monster is destroyed and the room complexity score drops.
5. The editor diff (shown in the Live Engine Inspector) reflects the real file change.

The Round-Trip Invariant guarantees that if the player "undoes" a spell, the source file
returns byte-for-byte to its pre-spell state.

### 2.4 Security Vulnerability → Monster Mapping

`SecurityScanResult[]` from `runSecurityScan()` feeds the monster population:

| Severity | Monster Type          | Visual (Person B)             |
|----------|-----------------------|-------------------------------|
| CRITICAL | Poltergeist Demon Boss| Large spectral boss entity    |
| HIGH     | Poltergeist Demon     | Standard spectral NPC         |
| MEDIUM   | Zombie Variable       | Shuffling zombie NPC          |
| LOW      | Shadow Lint Ghost     | Flickering shadow entity      |

### 2.5 Bedrock AI Spell Advisor

Before the player casts a spell, `generateBedrockPatch()` pre-computes the optimal
`SpliceRange` for the target node and presents it as a "Holy Incantation" UI hint.

---

## 3. Technology Stack

| Concern             | Technology                    | Owner    |
|---------------------|-------------------------------|----------|
| AST Engine          | morpheus-ast-core             | Person A |
| AI spell synthesis  | Amazon Bedrock (Claude 3)     | Person A |
| Security monsters   | SonarQube/Snyk/Aikido Power   | Person A |
| 3D dungeon render   | Three.js / React Three Fiber  | Person B |
| Monster shaders     | Custom GLSL shaders           | Person B |
| Spells UI           | React + spells/ components    | Person B |
| Audio               | Mirelo SFX / ElevenLabs       | Person B |
| Deployment          | Netlify / AWS CloudFront      | Person B |

---

## 4. Performance Constraints

- Dungeon room count ≤ 300 rooms at ≥ 30 FPS on a mid-range GPU.
- Surgical AST mutation (spell cast) must complete within 500 ms including file write.
- Bedrock spell hint must stream first token within 3 seconds.
- Rollback (undo spell) must restore the original source within 100 ms.
