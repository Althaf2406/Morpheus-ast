import { useMemo } from "react";
import * as THREE from "three";
import type { CityNode, CityEdge } from "../adapter.ts";
import { computeCityForceLayout } from "../layout/forceLayout.ts";

// --- Helpers ---

/** Topology-only key: fault state changes leave it untouched, so positions are not recomputed. */
function topologyKey(nodes: readonly CityNode[], edges: readonly CityEdge[]): string {
  const nodePart = nodes.map((n) => `${n.id}:${n.complexity}`).join("|");
  const edgePart = edges.map((e) => e.id).join("|");
  return `${nodePart}#${edgePart}`;
}

// --- Hook ---

/** Maps each node id to its force-directed world-space base position. */
export function useCityPositions(
  nodes: readonly CityNode[],
  edges: readonly CityEdge[]
): Map<string, THREE.Vector3> {
  const key = topologyKey(nodes, edges);
  return useMemo(() => new Map(computeCityForceLayout(nodes, edges).positions), [key]);
}
