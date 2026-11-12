# InfraShield 3D — Requirements (EARS Notation)
## App 1: Cyber City Serverless Resilience Auditor & Chaos Simulator

All requirements use **EARS (Easy Approach to Requirements Syntax)**:
- Ubiquitous: `THE SYSTEM SHALL`
- Event-driven: `WHEN <trigger> THE SYSTEM SHALL`
- State-driven: `WHILE <state> THE SYSTEM SHALL`
- Conditional: `WHERE <condition> THE SYSTEM SHALL`
- Unwanted behaviour: `IF <condition> THEN THE SYSTEM SHALL`

---

## REQ-IS-001: Repository Ingestion

WHEN a user provides a source repository (pre-loaded sample or file upload),
THE SYSTEM SHALL parse all TypeScript and JavaScript source files using
`packages/morpheus-ast-core` and produce a `TopologyGraph` within 5 seconds
for repositories containing up to 200 source files.

## REQ-IS-002: Topology Graph Rendering

WHEN a `TopologyGraph` is received from `adapter.ts`,
THE SYSTEM SHALL render a 3D force-directed graph where each module is a
spatial cluster, each function node is sized proportionally to its Cyclomatic
Complexity score, and each call relationship is a directed edge.

## REQ-IS-003: Chaos Fault Injection — Latency

WHEN a user clicks a function node and selects fault type LATENCY,
THE SYSTEM SHALL call `injectFault()` with `FaultType.LATENCY` and render an
animated pulse on the target node and all downstream nodes identified in the
`FaultInjectionResult.affectedNodes` list.

## REQ-IS-004: Chaos Fault Injection — Network Failure

WHEN a user selects fault type NETWORK_FAILURE on a function node,
THE SYSTEM SHALL visualize the removal of outgoing call edges and propagate
a cascading red highlight through all transitively dependent nodes that lack
a try/catch guard, as identified in `FaultInjectionResult.cascadePath`.

## REQ-IS-005: Chaos Fault Injection — Extreme Payload

WHEN a user selects fault type EXTREME_PAYLOAD on a function node,
THE SYSTEM SHALL animate an increase in the node's rendered size proportional
to the payload multiplier and highlight all taint-propagation paths returned
by `FaultInjectionResult.taintPaths`.

## REQ-IS-006: Chaos Fault Injection — Uncaught Exception

WHEN a user selects fault type UNCAUGHT_EXCEPTION on a function node,
THE SYSTEM SHALL animate a building-collapse effect on the target node and
propagate cascading failure highlights to all downstream nodes without
exception handling, terminating propagation at nodes with explicit fallback.

## REQ-IS-007: Blast-Radius Computation

WHEN a fault is injected,
THE SYSTEM SHALL display the computed blast-radius score, betweenness
centrality rank, and the ordered `cascadePath` for the affected function
returned by `computeBlastRadius()`.

## REQ-IS-008: Bedrock AI Patch Suggestion

WHEN a `FaultInjectionResult` is available,
THE SYSTEM SHALL request a surgical AST patch suggestion from
`generateBedrockPatch()` and display the streaming recommendation in the
SRE dashboard panel within 3 seconds of first token.

## REQ-IS-009: 1-Click Bugfix Spec Generation

WHEN a user clicks the "Generate Bugfix Spec" button after a fault simulation,
THE SYSTEM SHALL call `generateBugfixSpec()` and produce a downloadable
`bugfix.md` file containing Current Behavior (Defect), Expected Behavior
(Correct), and Unchanged Behavior / Preservation Properties sections.

## REQ-IS-010: Security Scan Ingestion

WHEN a repository is loaded,
THE SYSTEM SHALL call `runSecurityScan()` and render each `SecurityScanResult`
as a risk report entry in the SRE dashboard, classified by severity
(CRITICAL / HIGH / MEDIUM / LOW) and category.

## REQ-IS-011: Live Engine Inspector Toggle

WHEN the user activates the Live Engine Inspector Toggle,
THE SYSTEM SHALL display a transparent telemetry overlay showing raw AST node
list, Cyclomatic Complexity scores, blast-radius matrix, and fast-check
mutation log, refreshing at a maximum interval of 100 ms.

## REQ-IS-012: No-Login Public Access

THE SYSTEM SHALL be accessible at a public URL without requiring authentication,
login, or local credential configuration, with a pre-loaded serverless sample
repository available immediately on page load.

## REQ-IS-013: Dependency Isolation

THE SYSTEM SHALL NOT import any module from `packages/morpheus-ast-core/`
other than the typed interfaces exported from `contracts.ts`.

IF a build-time boundary check (`lint:boundaries`) detects a violation,
THEN THE SYSTEM SHALL fail the CI pipeline with a non-zero exit code and
print the offending import path.

## REQ-IS-014: Performance — Rendering

WHILE the 3D scene contains up to 500 nodes,
THE SYSTEM SHALL maintain a minimum of 30 frames per second on a device
with a mid-range GPU (equivalent to NVIDIA GTX 1060 or Apple M1).

## REQ-IS-015: Performance — Blast-Radius

WHEN `computeBlastRadius()` is called on a graph with up to 200 edges,
THE SYSTEM SHALL return a `BlastRadiusResult` within 200 milliseconds.
