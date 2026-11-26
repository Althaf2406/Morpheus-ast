import * as THREE from "three";
// --- Helpers ---
function pickable(object: THREE.Object3D): object is THREE.InstancedMesh {
  return object instanceof THREE.InstancedMesh && object.visible && Array.isArray(object.userData.nodeIds);
}
/** Returns the id of the building under the normalized pointer position, or null. */
export function pickNodeId(
  raycaster: THREE.Raycaster,
  scene: THREE.Scene,
  camera: THREE.Camera,
  ndc: THREE.Vector2
): string | null {
  const meshes = scene.children.filter(pickable);
  // --- Single-instance meshes are re-posed by the fault animation, so drop the cached bounds ---
  meshes.forEach((m) => { if (m.count === 1) m.boundingSphere = null; });
  raycaster.setFromCamera(ndc, camera);
  for (const hit of raycaster.intersectObjects(meshes, false)) {
    const ids = hit.object.userData.nodeIds as readonly string[];
    if (hit.instanceId != null && ids[hit.instanceId] != null) return ids[hit.instanceId];
  }
  return null;
}
