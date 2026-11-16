import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityNode } from "../../adapter.ts";

// --- Color constants ---
const COLOR_HEALTHY = new THREE.Color("#00e5ff");

interface Props {
  readonly nodes: readonly CityNode[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
  /** Called once on mount with the per-frame tick; called with null on unmount. */
  readonly onTickUpdate: (tick: ((elapsedTime: number) => void) | null) => void;
}

export function CityNodes({ nodes, positions, scene, onTickUpdate }: Props) {
  const meshesRef = useRef<THREE.InstancedMesh[]>([]);

  useEffect(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // Build one instanced mesh for healthy nodes only.
    // Faulted and affected nodes are managed exclusively by the fault animation.
    const groups: Array<{ color: THREE.Color; indices: number[] }> = [
      { color: COLOR_HEALTHY, indices: [] },
    ];

    nodes.forEach((node, i) => {
      // Faulted and affected nodes are drawn exclusively by the fault animation
      // system (buildFaultAnimation). Drawing them here too would double-layer them.
      if (node.isFaulted || node.isAffected) return;
      groups[0].indices.push(i);
    });

    const meshes: THREE.InstancedMesh[] = groups
      .filter((g) => g.indices.length > 0)
      .map((group) => {
        const mat = new THREE.MeshStandardMaterial({
          color: group.color,
          emissive: group.color,
          emissiveIntensity: 0.15,
          roughness: 0.4,
          metalness: 0.6,
        });
        const mesh = new THREE.InstancedMesh(geo, mat, group.indices.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        group.indices.forEach((nodeIdx, instIdx) => {
          const node   = nodes[nodeIdx];
          const height = Math.max(node.complexity * 0.5, 0.5);
          const pos    = positions.get(node.id) ?? new THREE.Vector3();
          const matrix = new THREE.Matrix4();
          matrix.compose(
            new THREE.Vector3(pos.x, height * 0.5, pos.z),
            new THREE.Quaternion(),
            new THREE.Vector3(1, height, 1)
          );
          mesh.setMatrixAt(instIdx, matrix);
          mesh.setColorAt(instIdx, group.color);
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

        mesh.userData = { nodeIndices: group.indices };
        scene.add(mesh);
        return mesh;
      });

    meshesRef.current = meshes;

    // CityNodes has no per-frame animation — healthy buildings are static.
    // Faulted/affected animation is owned entirely by useFaultAnimation.
    onTickUpdate(null);

    return () => {
      onTickUpdate(null);
      meshes.forEach((mesh) => {
        scene.remove(mesh);
        (mesh.material as THREE.MeshStandardMaterial).dispose();
      });
      geo.dispose();
      meshesRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, positions, scene]);

  return null;
}
