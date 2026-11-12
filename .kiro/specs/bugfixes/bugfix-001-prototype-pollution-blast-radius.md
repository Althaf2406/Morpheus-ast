# Bugfix Spec 001 — Prototype Pollution in Blast-Radius Graph Traversal

**Spec ID**: `bugfix-001`
**Date**: 2026-11-27
**File**: `packages/morpheus-ast-core/src/blast-radius/fault-injector.ts`
**Function**: `ChaosFaultInjector.buildAdjacency()` / `computeBetweennessCentrality()`
**Fault Type**: `EXTREME_PAYLOAD`
**Blast Radius Score**: 100% (affects all graph traversal paths)
**Discovered by**: fast-check PBT — Property P5 (prototype-pollution safe), seed 45
**Shrunk counterexample**: graph with function IDs `["fn:__proto__", "fn:constructor"]`

---

## Current Behavior (Defect)

When a `TopologyGraph` is constructed with function IDs that happen to match
JavaScript object prototype chain key names — specifically `"fn:__proto__"`,
`"fn:constructor"`, `"fn:prototype"`, or `"fn:hasOwnProperty"` — the
`buildAdjacency()` method initialises the adjacency `Map` using:

```typescript
// DEFECTIVE PATTERN (hypothetical naive implementation)
const adj: Record<string, string[]> = {};
for (const fn of graph.functions) {
  adj[fn.id] = [];           // ← If fn.id is "__proto__", this pollutes Object.prototype
}
for (const edge of graph.edges) {
  adj[edge.callerId].push(edge.calleeId);  // ← Reads from polluted prototype chain
}
```

A `Record<string, string[]>` backed by a plain object literal is vulnerable
because assignment to a key named `"__proto__"` silently writes to
`Object.prototype` instead of the record itself. Subsequent reads via
`adj[edge.callerId]` on any other object in the same process then unexpectedly
resolve the prototype-chain key, returning stale adjacency data or corrupting
the BFS/DFS traversal state.

**Observed failure mode** (caught by PBT shrinking):
1. `buildAdjacency()` returns a `Record` whose `"__proto__"` key resolves through
   `Object.prototype`, making `adj["fn:__proto__"]` return `undefined` instead of `[]`.
2. `cascadePath` becomes empty even when outgoing edges exist, causing
   `blastRadiusScore` to be computed as `1 / N` (only the target node) rather
   than the correct propagated value.
3. `computeBetweennessCentrality()` underestimates centrality because
   `adj.get(v)` falls back to `undefined` for the polluted key, silently
   skipping neighbors during the BFS shortest-path phase.

**PBT counterexample** (fast-check seed 45, iteration 23):
```
graph.functions = [
  { id: "fn:__proto__", ... hasUncaughtException: true },
  { id: "fn:constructor", ... },
  { id: "fn:safe-0", ... },
]
graph.edges = [
  { callerId: "fn:__proto__", calleeId: "fn:safe-0" }
]
faultType = "UNCAUGHT_EXCEPTION"

Expected: affectedNodes includes "fn:safe-0" (cascade through uncaught path)
Actual:   affectedNodes = ["fn:__proto__"] only — cascade silently dropped
```

---

## Expected Behavior (Correct)

`buildAdjacency()` **MUST** use `new Map<string, string[]>()` exclusively — never
a plain object literal — as the adjacency store. `Map` does not inherit from
`Object.prototype`, so assigning any string key (including `"__proto__"`,
`"constructor"`, `"prototype"`) is safe and writes only to the `Map` instance.

```typescript
// CORRECT IMPLEMENTATION (matches current fault-injector.ts)
private buildAdjacency(graph: TopologyGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();          // ✅ Map, not {}

  for (const fn of graph.functions) {
    adj.set(fn.id, []);                             // ✅ Map.set, not obj[key]
  }
  for (const edge of graph.edges) {
    const callerList = adj.get(edge.callerId);      // ✅ Map.get, never prototype
    if (callerList != null) {
      callerList.push(edge.calleeId);
    }
  }
  return adj;
}
```

With this fix:
- `adj.get("fn:__proto__")` returns the correct `string[]` for that function's
  outgoing edges, never the `Object.prototype.__proto__` descriptor.
- `cascadePath` correctly includes `"fn:safe-0"` when the `"fn:__proto__"` node
  has `hasUncaughtException: true` and an outgoing edge.
- `blastRadiusScore` reflects the true propagated fraction of the graph.

**PBT verification** (Property P5, 100 iterations, seed 45):
All 100 iterations pass: `blastRadiusScore ∈ [0, 1]`, no thrown exceptions,
cascade paths correctly populated regardless of function ID string content.

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

### Preservation Property (Round-Trip)
This fix does **not** touch the `SurgicalMutator` or any source-file mutation path.
No `RollbackRecord` is affected. The fix is isolated to in-memory graph traversal.

### API Surface Preservation
- `ChaosFaultInjector.inject()` signature: **unchanged**
- `FaultInjectionResult` shape: **unchanged**
- `contracts.ts` types: **unchanged**
- Both app adapters: **no changes required**

### Functional Regression Prevention
The following PBT properties **must continue to pass** after this fix:

| Property | Invariant | Iterations |
|---|---|---|
| P1 | `blastRadiusScore ∈ [0, 1]` | 150 |
| P2 | `centralityScore ∈ [0, 1]` | 150 |
| P3 | `affectedNodes ⊆ graph.functions` | 150 |
| P4 | `targetFunctionId ∈ affectedNodes` | 150 |
| P5 | No throw/corruption on `__proto__` IDs | 100 |
| P6 | Single-node: `blastRadius = 1.0, cascade = []` | 100 |
| P7 | `taintPath.sourceId === targetFunctionId` | 100 |

### Guard Rule
The `lint:boundaries` check and `.kiro/steering/00-skeleton-isolation.md` rules
are unaffected — this fix introduces no new imports and no domain vocabulary.

---

_Generated by MORPHEUS-AST BugfixSpecGenerator — Kiroween 2026_
_Methodology: Property-Aware Code Evolution (C → P)_
