import * as THREE from "three";

// --- Constants ---

const HEIGHT_PER_COMPLEXITY = 0.5;
const MIN_BUILDING_HEIGHT   = 0.5;
const MIN_SEGMENT_LENGTH    = 1e-4;
const FORWARD_AXIS          = new THREE.Vector3(0, 0, 1);

// --- Scratch objects (reused to avoid per-call allocation) ---

const scratchMatrix = new THREE.Matrix4();
const scratchQuat   = new THREE.Quaternion();
const scratchEuler  = new THREE.Euler();
const scratchPos    = new THREE.Vector3();
const scratchScale  = new THREE.Vector3();
const scratchDir    = new THREE.Vector3();

// --- Helpers ---

/** Building height derived from cyclomatic complexity. */
export function buildingHeight(complexity: number): number {
  return Math.max(complexity * HEIGHT_PER_COMPLEXITY, MIN_BUILDING_HEIGHT);
}

/** Writes a box pose (position, scale, rotation about Z) into one instance slot. */
export function setBoxPose(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3Like,
  scale: THREE.Vector3Like,
  rotationZ = 0
): void {
  scratchQuat.setFromEuler(scratchEuler.set(0, 0, rotationZ));
  scratchPos.set(position.x, position.y, position.z);
  scratchScale.set(scale.x, scale.y, scale.z);
  scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
  mesh.instanceMatrix.needsUpdate = true;
}

/** Stretches a unit box into a road segment between two points. */
export function setSegmentPose(
  mesh: THREE.InstancedMesh,
  index: number,
  from: THREE.Vector3,
  to: THREE.Vector3,
  width: number
): void {
  scratchDir.subVectors(to, from);
  const length = Math.max(scratchDir.length(), MIN_SEGMENT_LENGTH);
  scratchQuat.setFromUnitVectors(FORWARD_AXIS, scratchDir.divideScalar(length));
  scratchPos.addVectors(from, to).multiplyScalar(0.5);
  scratchScale.set(width, width, length);
  scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
  mesh.instanceMatrix.needsUpdate = true;
}
