import { useEffect } from "react";
import * as THREE from "three";
import type { CityEdge, CityNode } from "../../adapter.ts";
import { buildingHeight, setSegmentPose } from "./instancePose.ts";

// --- Edge color and width constants ---
const COLOR_CASCADING = new THREE.Color("#ff2222");
const COLOR_CYCLIC    = new THREE.Color("#ffaa00");
const COLOR_NORMAL    = new THREE.Color("#334466");
const MIN_WIDTH       = 0.04;
const WIDTH_PER_CENTRALITY = 0.12;

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

/** Building-top position from base position + node complexity. */
function buildingTop(node: CityNode | undefined, positions: Map<string, THREE.Vector3>): THREE.Vector3 {
  const base = node != null ? positions.get(node.id) : undefined;
  if (node == null || base == null) return new THREE.Vector3();
  return new THREE.Vector3(base.x, buildingHeight(node.complexity), base.z);
}

export function CityEdges({ edges, nodes, positions, scene }: Props) {
  useEffect(() => {
    // --- Static edges: exclude those connected to faulted nodes (handled by the fault animation) ---
    const faultedIds = new Set(nodes.filter((n) => n.isFaulted).map((n) => n.id));
    const staticEdges = edges.filter(
      (e) => !faultedIds.has(e.sourceId) && !faultedIds.has(e.targetId)
    );
    if (staticEdges.length === 0) return;

    const byId = new Map(nodes.map((n) => [n.id, n]));
    const geo  = new THREE.BoxGeometry(1, 1, 1);
    const mat  = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.75 });
    const mesh = new THREE.InstancedMesh(geo, mat, staticEdges.length);

    staticEdges.forEach((edge, i) => {
      const src = byId.get(edge.sourceId);
      const tgt = byId.get(edge.targetId);
      const centrality = ((src?.centralityScore ?? 0) + (tgt?.centralityScore ?? 0)) / 2;
      setSegmentPose(
        mesh, i, buildingTop(src, positions), buildingTop(tgt, positions),
        MIN_WIDTH + WIDTH_PER_CENTRALITY * centrality
      );
      mesh.setColorAt(i, edgeColor(edge));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    return () => {
      scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, [edges, nodes, positions, scene]);

  return null;
}
