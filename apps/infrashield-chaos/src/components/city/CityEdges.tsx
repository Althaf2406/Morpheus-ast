import { useEffect } from "react";
import * as THREE from "three";
import type { CityEdge, CityNode } from "../../adapter.ts";

// --- Edge color constants ---
const COLOR_CASCADING = new THREE.Color("#ff2222");
const COLOR_CYCLIC    = new THREE.Color("#ffaa00");
const COLOR_NORMAL    = new THREE.Color("#334466");

interface Props {
  readonly edges: readonly CityEdge[];
  readonly nodes: readonly CityNode[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
}

function edgeColor(edge: CityEdge): THREE.Color {
  if (edge.isCascading) return COLOR_CASCADING;
  if (edge.isCyclic)    return COLOR_CYCLIC;
  return COLOR_NORMAL;
}

/** Builds a building-top position from base position + node complexity. */
function buildingTop(
  nodeId: string,
  nodes: readonly CityNode[],
  positions: Map<string, THREE.Vector3>
): THREE.Vector3 {
  const base = positions.get(nodeId);
  if (base == null) return new THREE.Vector3();
  const node   = nodes.find((n) => n.id === nodeId);
  const height = node != null ? Math.max(node.complexity * 0.5, 0.5) : 0.5;
  return new THREE.Vector3(base.x, height, base.z);
}

export function CityEdges({ edges, nodes, positions, scene }: Props) {
  useEffect(() => {
    // --- Static edges: exclude those connected to faulted nodes (handled by useFaultAnimation) ---
    const faultedIds = new Set(nodes.filter((n) => n.isFaulted).map((n) => n.id));
    const staticEdges = edges.filter(
      (e) => !faultedIds.has(e.sourceId) && !faultedIds.has(e.targetId)
    );

    if (staticEdges.length === 0) return;

    // 2 vertices per edge, 3 floats per vertex
    const posArr = new Float32Array(staticEdges.length * 2 * 3);
    const colArr = new Float32Array(staticEdges.length * 2 * 3);

    staticEdges.forEach((edge, i) => {
      const src = buildingTop(edge.sourceId, nodes, positions);
      const tgt = buildingTop(edge.targetId, nodes, positions);
      const col = edgeColor(edge);

      const base       = i * 6;
      posArr[base + 0] = src.x; posArr[base + 1] = src.y; posArr[base + 2] = src.z;
      posArr[base + 3] = tgt.x; posArr[base + 4] = tgt.y; posArr[base + 5] = tgt.z;

      colArr[base + 0] = col.r; colArr[base + 1] = col.g; colArr[base + 2] = col.b;
      colArr[base + 3] = col.r; colArr[base + 4] = col.g; colArr[base + 5] = col.b;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colArr, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
      transparent: true,
      opacity: 0.75,
    });

    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);

    return () => {
      scene.remove(lines);
      geo.dispose();
      mat.dispose();
    };
  }, [edges, nodes, positions, scene]);

  return null;
}
