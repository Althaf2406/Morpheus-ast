import { useEffect } from "react";
import * as THREE from "three";
import type { CityNode } from "../../adapter.ts";
import { COLOR_HEALTHY } from "./faultTypes.ts";
import { buildingHeight, buildingWidth } from "../../layout/buildingScale.ts";
import { setBoxPose } from "./instancePose.ts";

interface Props {
  readonly nodes: readonly CityNode[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
}

/** Renders healthy (and recovered) buildings as one static InstancedMesh. */
export function CityNodes({ nodes, positions, scene }: Props) {
  useEffect(() => {
    // --- Faulted and affected nodes are drawn by the fault animation, not here ---
    const healthy = nodes.filter((n) => !n.isFaulted && !n.isAffected);
    if (healthy.length === 0) return;

    const geo  = new THREE.BoxGeometry(1, 1, 1);
    const mat  = new THREE.MeshStandardMaterial({
      color: COLOR_HEALTHY, emissive: COLOR_HEALTHY,
      emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.6,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, healthy.length);

    healthy.forEach((node, i) => {
      const height = buildingHeight(node.complexity);
      const width  = buildingWidth(node.complexity);
      const pos    = positions.get(node.id) ?? new THREE.Vector3();
      setBoxPose(mesh, i, { x: pos.x, y: height / 2, z: pos.z }, { x: width, y: height, z: width });
      mesh.setColorAt(i, COLOR_HEALTHY);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData = { nodeIds: healthy.map((n) => n.id) };
    scene.add(mesh);

    return () => {
      scene.remove(mesh);
      mesh.dispose();
      geo.dispose();
      mat.dispose();
    };
  }, [nodes, positions, scene]);

  return null;
}
