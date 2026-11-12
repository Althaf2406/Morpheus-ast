# InfraShield 3D — Design Document
## App 1: Cyber City Serverless Resilience Auditor & Chaos Simulator

---

## 1. Overview

InfraShield 3D is a browser-based, serverless cloud resilience auditor that consumes the
`morpheus-ast-core` engine exclusively via `contracts.ts`. It renders a live 3D Cyber City
where every building represents a cloud module (Lambda, API Gateway, DynamoDB table),
every street is a call edge, and every glowing fault cluster is an active blast-radius zone.

**All data flow is strictly unidirectional:**
```
contracts.ts (core output) → adapter.ts (App 1 transform) → React/Three.js UI
```

No code inside `apps/infrashield-chaos/` may import from `packages/morpheus-ast-core/`
beyond `contracts.ts`.

---

## 2. Architecture

### 2.1 Layer Stack

```
┌─────────────────────────────────────────────┐
│  Three.js Cyber City Renderer  (Person B)   │
│  SRE Dashboard Panel           (Person B)   │
│  Live Engine Inspector Toggle  (Person B)   │
├─────────────────────────────────────────────┤
│  adapter.ts   ← contracts.ts only  (Shared) │
├─────────────────────────────────────────────┤
│  packages/morpheus-ast-core  (Person A)     │
│  ├── parser/                                │
│  ├── topology/                              │
│  ├── blast-radius/                          │
│  ├── mutator/                               │
│  └── bedrock-advisor/  (Week 2)             │
└─────────────────────────────────────────────┘
```

### 2.2 Core Data Flow

1. User provides a serverless repository (pre-loaded sample or upload).
2. `adapter.ts` calls `parseSourceFiles()` → receives `TopologyGraph`.
3. `adapter.ts` calls `computeBlastRadius()` → receives `BlastRadiusResult`.
4. User clicks a function node → `adapter.ts` calls `injectFault()` → receives `FaultInjectionResult`.
5. `adapter.ts` calls `generateBedrockPatch()` → receives `BedrockPatchSuggestion`.
6. User clicks "Generate Bugfix Spec" → `adapter.ts` calls `generateBugfixSpec()` → writes `bugfix.md`.
7. `adapter.ts` calls `runSecurityScan()` → receives `SecurityScanResult[]` for risk report rendering.

### 2.3 Chaos Fault Types

| Fault Type        | Core Engine Mechanism               | Visual Effect (Person B)         |
|-------------------|-------------------------------------|----------------------------------|
| Latency Injection | `FaultType.LATENCY`                 | Node pulse animation             |
| Network Failure   | `FaultType.NETWORK_FAILURE`         | Edge deletion + red cascade      |
| Extreme Payload   | `FaultType.EXTREME_PAYLOAD`         | Node size spike                  |
| Uncaught Exception| `FaultType.UNCAUGHT_EXCEPTION`      | Building collapse + cascading red|

### 2.4 1-Click Bugfix Spec Generator

When a chaos simulation produces a `FaultInjectionResult`, the app offers a single button
that calls `generateBugfixSpec()` from the core engine and writes a conformant `bugfix.md`
file structured as:
- **Current Behavior (Defect)**
- **Expected Behavior (Correct)**
- **Unchanged Behavior / Preservation Properties (Regression Prevention)**

### 2.5 Security Risk Report

`SecurityScanResult[]` from `runSecurityScan()` feeds the SRE risk dashboard panel.
Each finding is classified by `severity` (CRITICAL / HIGH / MEDIUM / LOW) and `category`
(VULNERABILITY / CODE_SMELL / SECRET_LEAK / DEPENDENCY_RISK).

---

## 3. Technology Stack

| Concern             | Technology                    | Owner    |
|---------------------|-------------------------------|----------|
| AST Engine          | morpheus-ast-core             | Person A |
| Cloud emulation     | LocalStack MCP                | Person A |
| Security scanning   | SonarQube/Snyk/Aikido Power   | Person A |
| AI patch synthesis  | Amazon Bedrock (Claude 3)     | Person A |
| 3D rendering        | Three.js / React Three Fiber  | Person B |
| UI framework        | React + Vite + TypeScript     | Person B |
| Audio               | Mirelo SFX / ElevenLabs       | Person B |
| Deployment          | AWS CloudFront / Netlify      | Person B |

---

## 4. Performance Constraints

- Topology graph must render ≤ 500 nodes at ≥ 30 FPS on a mid-range GPU.
- Blast-radius propagation must complete within 200 ms for graphs with ≤ 200 edges.
- Bedrock patch suggestion must stream first token within 3 seconds.
- Live Engine Inspector must update at ≤ 100 ms polling interval without blocking the render thread.
