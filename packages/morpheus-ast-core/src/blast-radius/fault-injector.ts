/**
 * blast-radius/fault-injector.ts
 *
 * Chaos Fault Injection Engine — simulates latency, network failure,
 * extreme payload, and uncaught exception faults against a TopologyGraph.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary
 *   - Zero `any` types
 *   - Pure graph analysis — does NOT mutate source files
 *   - Prototype-pollution safe (no Object.assign on untrusted input,
 *     no __proto__ or constructor key access)
 */

import type {
  FaultInjectionRequest,
  FaultInjectionResult,
  FaultType,
  TopologyGraph,
  FunctionNode,
  CallEdge,
  CascadeStep,
  TaintPath,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Custom error
// ─────────────────────────────────────────────────────────────────────────────

export class FaultInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FaultInjectionError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ChaosFaultInjector
// ─────────────────────────────────────────────────────────────────────────────

export class ChaosFaultInjector {
  /**
   * Injects a fault into the topology graph and returns the computed
   * blast-radius result. Pure analysis — no source file mutation.
   */
  inject(
    request: FaultInjectionRequest,
    graph: TopologyGraph
  ): FaultInjectionResult {
    const startMs = Date.now();

    const target = this.requireFunction(request.targetFunctionId, graph);
    const adjacency = this.buildAdjacency(graph);

    const cascadePath = this.propagateCascade(target, graph, adjacency, request.faultType);
    const affectedNodes = [target.id, ...cascadePath.map((s) => s.functionId)];
    const taintPaths = this.computeTaintPaths(target, graph, adjacency, request.faultType);
    const centralityScore = this.computeBetweennessCentrality(target.id, graph, adjacency);
    const blastRadiusScore = affectedNodes.length / Math.max(graph.functions.length, 1);

    return {
      targetFunctionId: target.id,
      faultType: request.faultType,
      affectedNodes,
      cascadePath,
      taintPaths,
      centralityScore,
      blastRadiusScore,
      durationMs: Date.now() - startMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cascade propagation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * BFS from target node following call edges downward.
   * Propagation stops at a node that has proper error handling
   * (unless the fault type bypasses all guards).
   */
  private propagateCascade(
    target: FunctionNode,
    graph: TopologyGraph,
    adjacency: Map<string, string[]>,
    faultType: FaultType
  ): CascadeStep[] {
    const steps: CascadeStep[] = [];
    const visited = new Set<string>([target.id]);
    const queue: Array<{ id: string; depth: number }> = [{ id: target.id, depth: 0 }];

    const functionMap = this.buildFunctionMap(graph);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current == null) break;

      const neighbors = adjacency.get(current.id) ?? [];

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighbor = functionMap.get(neighborId);
        if (neighbor == null) continue;

        const reason = this.determineCascadeReason(neighbor, faultType);
        if (reason == null) continue; // node is protected — cascade stops here

        steps.push({ functionId: neighborId, reason, depth: current.depth + 1 });
        queue.push({ id: neighborId, depth: current.depth + 1 });
      }
    }

    return steps;
  }

  /**
   * Returns the cascade reason if propagation should continue through this node,
   * or null if the node is adequately protected against the given fault type.
   */
  private determineCascadeReason(
    fn: FunctionNode,
    faultType: FaultType
  ): CascadeStep["reason"] | null {
    switch (faultType) {
      case "UNCAUGHT_EXCEPTION":
        return fn.hasUncaughtException ? "NO_TRY_CATCH" : null;

      case "NETWORK_FAILURE":
        // Propagates through nodes with no fallback (approximated as uncaught exception)
        return fn.hasUncaughtException ? "NO_FALLBACK" : null;

      case "LATENCY":
        // Latency cascades through all reachable nodes (timeout can propagate everywhere)
        return "TAINT_PROPAGATION";

      case "EXTREME_PAYLOAD":
        // Propagates through nodes that could receive tainted data
        return fn.parameterCount > 0 ? "TAINT_PROPAGATION" : null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Taint path analysis (prototype-pollution safe)
  // ─────────────────────────────────────────────────────────────────────────

  private computeTaintPaths(
    target: FunctionNode,
    graph: TopologyGraph,
    adjacency: Map<string, string[]>,
    faultType: FaultType
  ): TaintPath[] {
    if (faultType !== "EXTREME_PAYLOAD" && faultType !== "UNCAUGHT_EXCEPTION") {
      return [];
    }

    const taintType =
      faultType === "EXTREME_PAYLOAD" ? "PAYLOAD_OVERFLOW" : "PROTOTYPE_POLLUTION";

    const paths: TaintPath[] = [];
    const visited = new Set<string>([target.id]);

    // DFS to find all reachable sink nodes
    const dfs = (currentId: string, pathSoFar: string[]): void => {
      const neighbors = adjacency.get(currentId) ?? [];

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const newPath = [...pathSoFar, neighborId];
        paths.push({
          sourceId: target.id,
          sinkId: neighborId,
          path: newPath,
          taintType,
        });

        dfs(neighborId, newPath);
      }
    };

    dfs(target.id, [target.id]);

    // Prototype pollution check: flag any function whose name or params
    // could be a __proto__ access path — safe string comparison only
    if (faultType === "EXTREME_PAYLOAD") {
      for (const fn of graph.functions) {
        const isProtoSink =
          fn.name.includes("assign") ||
          fn.name.includes("merge") ||
          fn.name.includes("extend") ||
          fn.name.includes("defaults");

        if (isProtoSink && !visited.has(fn.id)) {
          paths.push({
            sourceId: target.id,
            sinkId: fn.id,
            path: [target.id, fn.id],
            taintType: "PROTOTYPE_POLLUTION",
          });
        }
      }
    }

    return paths;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Betweenness centrality (Brandes algorithm, simplified)
  // ─────────────────────────────────────────────────────────────────────────

  private computeBetweennessCentrality(
    targetId: string,
    graph: TopologyGraph,
    adjacency: Map<string, string[]>
  ): number {
    const nodes = graph.functions.map((f) => f.id);
    const n = nodes.length;
    if (n <= 1) return 0;

    let betweenness = 0;

    for (const source of nodes) {
      if (source === targetId) continue;

      // BFS to find shortest paths from source
      const dist = new Map<string, number>();
      const sigma = new Map<string, number>(); // number of shortest paths
      const pred = new Map<string, string[]>(); // predecessors

      for (const node of nodes) {
        dist.set(node, -1);
        sigma.set(node, 0);
        pred.set(node, []);
      }

      dist.set(source, 0);
      sigma.set(source, 1);

      const queue: string[] = [source];
      const stack: string[] = [];

      while (queue.length > 0) {
        const v = queue.shift()!;
        stack.push(v);

        for (const w of adjacency.get(v) ?? []) {
          if (dist.get(w) === -1) {
            queue.push(w);
            dist.set(w, (dist.get(v) ?? 0) + 1);
          }
          if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
            sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
            pred.get(w)!.push(v);
          }
        }
      }

      // Accumulate dependencies
      const delta = new Map<string, number>();
      for (const node of nodes) delta.set(node, 0);

      while (stack.length > 0) {
        const w = stack.pop()!;
        for (const v of pred.get(w) ?? []) {
          const sigmaV = sigma.get(v) ?? 1;
          const sigmaW = sigma.get(w) ?? 1;
          const contribution = (sigmaV / sigmaW) * (1 + (delta.get(w) ?? 0));
          delta.set(v, (delta.get(v) ?? 0) + contribution);
        }
        if (w === targetId) {
          betweenness += delta.get(w) ?? 0;
        }
      }
    }

    // Normalize to [0, 1]
    const maxBetweenness = (n - 1) * (n - 2);
    return maxBetweenness > 0 ? betweenness / maxBetweenness : 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Graph helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildAdjacency(graph: TopologyGraph): Map<string, string[]> {
    const adj = new Map<string, string[]>();

    for (const fn of graph.functions) {
      adj.set(fn.id, []);
    }

    for (const edge of graph.edges) {
      const callerList = adj.get(edge.callerId);
      if (callerList != null) {
        callerList.push(edge.calleeId);
      }
    }

    return adj;
  }

  private buildFunctionMap(graph: TopologyGraph): Map<string, FunctionNode> {
    const map = new Map<string, FunctionNode>();
    for (const fn of graph.functions) {
      map.set(fn.id, fn);
    }
    return map;
  }

  private requireFunction(id: string, graph: TopologyGraph): FunctionNode {
    const fn = graph.functions.find((f) => f.id === id);
    if (fn == null) {
      throw new FaultInjectionError(
        `Function ID "${id}" not found in topology graph (${graph.functions.length} functions indexed).`
      );
    }
    return fn;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure blast-radius analysis (no fault injection)
// ─────────────────────────────────────────────────────────────────────────────

export function computeBlastRadius(
  functionId: string,
  graph: TopologyGraph
): import("../contracts.js").BlastRadiusResult {
  const startMs = Date.now();
  const injector = new ChaosFaultInjector();

  // Reuse fault injector adjacency logic via a lightweight shim
  const adj = buildAdjacencyStatic(graph);

  const reachable = bfsReachable(functionId, adj);
  const centralityScore = injector["computeBetweennessCentrality"](functionId, graph, adj);

  // Sort all nodes by centrality to compute rank
  const allNodes = graph.functions.map((f) => f.id);
  const scores = allNodes.map((id) => ({
    id,
    score: injector["computeBetweennessCentrality"](id, graph, adj),
  }));
  scores.sort((a, b) => b.score - a.score);
  const rank = scores.findIndex((s) => s.id === functionId) + 1;

  return {
    functionId,
    centralityRank: rank,
    centralityScore,
    reachabilityScore: reachable.length / Math.max(graph.functions.length, 1),
    reachableNodes: reachable,
    durationMs: Date.now() - startMs,
  };
}

function buildAdjacencyStatic(graph: TopologyGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const fn of graph.functions) adj.set(fn.id, []);
  for (const edge of graph.edges) {
    const list = adj.get(edge.callerId);
    if (list != null) list.push(edge.calleeId);
  }
  return adj;
}

function bfsReachable(startId: string, adj: Map<string, string[]>): string[] {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  const reachable: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        reachable.push(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return reachable;
}
