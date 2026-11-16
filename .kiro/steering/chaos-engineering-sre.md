---
inclusion: fileMatch
fileMatchPattern: "apps/infrashield-chaos/**/*"
---

# InfraShield 3D — UI Steering (Person B)

## Purpose
Cloud-resilience chaos auditor. The user is an SRE / backend engineer who wants to
SEE how one failing function cascades through a service. Every visual decision
must make cause and effect obvious in under 5 seconds (this is the demo video).

## Metaphor: "Cyber City"
- Function = building. Height = cyclomatic complexity (`CityNode.complexity`).
- Edge = road. Width = centrality (`centralityScore`). Cyclic edges look distinct.
- Faulted node = red pulse. Affected (blast radius) = amber. Healthy = cool cyan/steel.
- Calm, dark, technical look. No neon overload. Color carries meaning only
  (healthy / affected / faulted / cyclic), never decoration.

## Data boundary (hard rules)
- Import ONLY from `./adapter` (`InfraShieldAdapter`, `CyberCityLayout`, `SREDashboardData`...).
- NEVER import from `packages/morpheus-ast-core` directly, never from `apps/necro-compiler-game`.
- No `any`. No new domain logic that belongs in core (blast radius, parsing, mutation).
- UI state (selection, camera, toggles) lives in the app; engine state comes from the adapter.

## Rendering
- Three.js with `InstancedMesh` for nodes/edges. Target 30 FPS at 500 nodes (REQ-IS-014).
- Dispose geometries/materials/textures on unmount. Animate in a single rAF loop.
- Respect `prefers-reduced-motion`: replace pulses with static color changes.

## Layout of the app
- `src/components/city/`   Three.js scene, nodes, edges, camera
- `src/components/panels/` SRE dashboard, inspector, bugfix button
- `src/hooks/`             useAdapter, useCityLayout
- `src/adapter.ts`         owned by Person A, do not edit

## Code style
- TypeScript strict, small components (< 150 lines), one responsibility per file.
- Group comments only (`// --- Section ---`). No duplicate or unused code.
- Public access, no login (REQ-IS-012).
