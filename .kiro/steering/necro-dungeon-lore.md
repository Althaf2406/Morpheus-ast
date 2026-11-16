---
inclusion: fileMatch
fileMatchPattern: "apps/necro-compiler-game/**/*"
---

# NECRO-COMPILER — UI Steering (Person B)

## Purpose
A 3D Gothic dungeon game where the player really refactors source code. Players are
developers/gamers; the fantasy must stay readable: they should understand that
"casting a spell" edits real code and "Undo" restores it exactly.

## Lore mapping
- Monster = code smell / bug. Dungeon room = file. Corridor = call edge.
- Refactoring Spell = a real surgical mutation via `adapter.castSpell()`.
- Undo = `adapter.rollbackLastSpell()` (byte-for-byte restore, REQ-NC-007).
- "Holy Incantation" overlay = streamed Bedrock explanation of the fix.
- Inspector = real diff of what the spell changed in the file.

## Look and feel
- Gothic, low-key lighting, fog, torch-like warm accents on a cold stone palette.
- Monster shaders (GLSL) show state: alive (corrupted, noisy) → dying → purified.
- UI chrome (spell bar, HUD) stays minimal and legible over the 3D scene.

## Data boundary (hard rules)
- Import ONLY from `./adapter`. Never from `morpheus-ast-core` directly, never from
  `apps/infrashield-chaos`.
- No `any`. Never mutate files in the UI. Only the adapter mutates, via core splices.
- Game state (HP, selection, camera) is UI-only; code state comes from the adapter.

## Rendering
- Three.js, shaders in `src/shaders/*.glsl`, scene code in `src/components/dungeon/`.
- Dispose resources on unmount. Respect `prefers-reduced-motion`.

## Code style
- TypeScript strict, small components (< 150 lines), group comments only.
- No duplicate or unused code. Public access, no login.
