---
inclusion: always
---

# Skeleton Crew Architecture & Strict Isolation Governance (MORPHEUS-AST)

## 1. Repository Structure (Mandatory Kiroween 2026 Compliance)

This monorepo strictly enforces the Skeleton Crew pattern:

- `packages/morpheus-ast-core/`: The headless, domain-agnostic AST compiler, blast-radius analyzer, and surgical code mutator.
- `apps/infrashield-chaos/`: Serious cloud resilience and chaos engineering utility application folder (Repo Folder 1).
- `apps/necro-compiler-game/`: Functional horror 3D Gothic Dungeon crawler application folder (Repo Folder 2).

## 2. Unidirectional Dependency Rules (CRITICAL)

- Files inside `packages/morpheus-ast-core/` **MUST NEVER** import from `apps/infrashield-chaos/` or `apps/necro-compiler-game/`.
- `packages/morpheus-ast-core/` **MUST** remain 100% free of domain-specific terminology (no cloud/SRE UI terms, and no horror/monster/dungeon/spell terms) and UI rendering dependencies.
- Both applications **MUST** interact with the core engine exclusively through the typed interfaces defined in `packages/morpheus-ast-core/src/contracts.ts`.
- The only file inside `packages/morpheus-ast-core/` that apps may import is `contracts.ts`. No other internal module paths are public API.

## 3. Coding & Verification Standards

- **Never** use `any` in TypeScript; enforce `strict: true` in every `tsconfig.json`.
- Every public method in `packages/morpheus-ast-core/` must satisfy the EARS requirements and Property-Based Testing (PBT) invariants defined in `.kiro/specs/core-engine/`.
- All AST mutations **MUST** go through the Surgical Line-Range Splice mechanism in `src/mutator/`; direct string replacement of source text is forbidden.
- Tree-sitter WASM trees **MUST** be explicitly released via `tree.delete()` after use to prevent memory leaks during repeated real-time parsing.

## 4. Import Boundary Enforcement

The root `lint:boundaries` script (`pnpm run lint:boundaries`) **MUST** pass with zero violations before every commit. The `ast-roundtrip-guard` Agent Hook runs this check automatically on every file save inside `packages/morpheus-ast-core/src/`.

## 5. Forbidden Patterns (AI Agent Guard)

When generating or modifying code, the AI agent **MUST NOT**:

- Add `import` statements inside `packages/morpheus-ast-core/` that reference any path under `apps/`.
- Introduce the TypeScript type `any` anywhere in the codebase.
- Use string-based source text mutation (e.g., `.replace()`, template-literal patching) instead of AST splice operations.
- Add UI framework dependencies (React, Three.js, Vue, etc.) to `packages/morpheus-ast-core/package.json`.
- Include domain vocabulary such as `lambda`, `dungeon`, `spell`, `monster`, `chaos`, `serverless`, or `SRE` in any identifier or comment inside `packages/morpheus-ast-core/`.
