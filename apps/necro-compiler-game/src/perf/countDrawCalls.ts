import * as THREE from "three";

// --- Result shape ---
export interface DrawCallCount {
  readonly meshes: number;
  readonly points: number;
  readonly instancedMeshes: number;
  readonly total: number;
}

// --- Counts visible objects once each, regardless of instance count ---
export function countDrawCalls(scene: THREE.Scene): DrawCallCount {
  let meshes = 0;
  let points = 0;
  let instancedMeshes = 0;
  scene.traverseVisible((object) => {
    if (object instanceof THREE.InstancedMesh) instancedMeshes += 1;
    else if (object instanceof THREE.Mesh) meshes += 1;
    else if (object instanceof THREE.Points) points += 1;
  });
  return { meshes, points, instancedMeshes, total: meshes + points + instancedMeshes };
}
