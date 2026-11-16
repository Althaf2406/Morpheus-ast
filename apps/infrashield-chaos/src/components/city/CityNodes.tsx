import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityNode } from "../../adapter.ts";

// --- Color constants (healthy / affected / faulted) ---
const COLOR_HEALTHY  = new THREE.Color("#00e5ff");
const COLOR_AFFECTED = new THREE.Color("#ffaa00");
const COLOR_FAULTED  = new THREE.Color("#ff2222");

interface Props {
  readonly nodes: readonly CityNode[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
  readonly clock: THREE.Clock;
  readonly reducedMotion: boolean;
}

export function CityNodes({ nodes, positions, scene, clock, reducedMotion }: Props) {
  // Keep refs to allow cleanup without stale closure captures
  const meshesRef = useRef<THREE.InstancedMesh[]>([]);

  useEffect(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // Build three instanced meshes — one per color group
    const groups: Array<{ color: THREE.Color; indices: number[] }> = [
      { color: COLOR_HEALTHY,  indices: [] },
      { color: COLOR_AFFECTED, indices: [] },
      { color: COLOR_FAULTED,  indices: [] },
    ];

    nodes.forEach((node, i) => {
      if (node.isFaulted)        groups[2].indices.push(i);
      else if (node.isAffected)  groups[1].indices.push(i);
      else                       groups[0].indices.push(i);
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
          const node = nodes[nodeIdx];
          const height = Math.max(node.complexity * 0.5, 0.5);
          const pos = positions.get(node.id) ?? new THREE.Vector3();
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

        // Store node indices on userData for animation
        mesh.userData = { nodeIndices: group.indices, isFaulted: group.color === COLOR_FAULTED };
        scene.add(mesh);
        return mesh;
      });

    meshesRef.current = meshes;

    // --- rAF pulse animation for faulted nodes (skipped when reducedMotion) ---
    let rafId: number;

    if (!reducedMotion) {
      const dummy = new THREE.Object3D();

      const animate = () => {
        rafId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        meshes.forEach((mesh) => {
          if (!mesh.userData["isFaulted"]) return;
          const nodeIndices = mesh.userData["nodeIndices"] as number[];
          nodeIndices.forEach((nodeIdx, instIdx) => {
            const node = nodes[nodeIdx];
            const baseHeight = Math.max(node.complexity * 0.5, 0.5);
            const pulse = 1 + 0.08 * Math.sin(t * 4);
            const pos = positions.get(node.id) ?? new THREE.Vector3();
            dummy.position.set(pos.x, baseHeight * 0.5 * pulse, pos.z);
            dummy.scale.set(1, baseHeight * pulse, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(instIdx, dummy.matrix);
          });
          mesh.instanceMatrix.needsUpdate = true;
        });
      };

      rafId = requestAnimationFrame(animate);
    }

    return () => {
      if (!reducedMotion) cancelAnimationFrame(rafId);
      meshes.forEach((mesh) => {
        scene.remove(mesh);
        (mesh.material as THREE.MeshStandardMaterial).dispose();
      });
      geo.dispose();
      meshesRef.current = [];
    };
  }, [nodes, positions, scene, clock, reducedMotion]);

  return null;
}
