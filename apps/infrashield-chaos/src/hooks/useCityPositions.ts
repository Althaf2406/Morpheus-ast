import { useMemo } from "react";
import * as THREE from "three";
import type { CityNode } from "../adapter.ts";

/**
 * Maps each node id to its world-space base position.
 * Grid formula: x = (i % 4) * 6 - 9, z = floor(i / 4) * 6 - 6, y = 0
 */
export function useCityPositions(
  nodes: readonly CityNode[]
): Map<string, THREE.Vector3> {
  return useMemo(() => {
    const map = new Map<string, THREE.Vector3>();
    nodes.forEach((node, i) => {
      const x = (i % 4) * 6 - 9;
      const z = Math.floor(i / 4) * 6 - 6;
      map.set(node.id, new THREE.Vector3(x, 0, z));
    });
    return map;
  }, [nodes]);
}
