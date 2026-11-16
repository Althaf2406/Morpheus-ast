import * as THREE from "three";

// --- Types ---

export interface CameraFrame {
  /** Suggested camera world position. */
  readonly position:    THREE.Vector3;
  /** Point the camera should look at. */
  readonly target:      THREE.Vector3;
  /** Recommended OrbitControls maxDistance. */
  readonly maxDistance: number;
  /** Distance from position to target — used for scene-relative fog. */
  readonly camDist:     number;
}

// --- Pure framing function ---

/**
 * Given a set of room positions, computes a camera position that frames the
 * entire dungeon in view with a comfortable margin.
 *
 * Rules:
 *  - Target is the centroid of all positions.
 *  - Bounding sphere radius is the max distance from centroid to any position.
 *  - Camera sits above and back at ~1.1× the sphere diameter (45° elevation).
 *  - maxDistance is 3× the sphere radius (to allow zooming out further).
 */
export function frameCamera(
  positions: ReadonlyMap<string, THREE.Vector3>
): CameraFrame {
  if (positions.size === 0) {
    return {
      position:    new THREE.Vector3(0, 20, 32),
      target:      new THREE.Vector3(0, 0, 0),
      maxDistance: 200,
      camDist:     new THREE.Vector3(0, 20, 32).length(),
    };
  }

  // Centroid
  const centroid = new THREE.Vector3();
  for (const p of positions.values()) {
    centroid.add(p);
  }
  centroid.divideScalar(positions.size);

  // Bounding sphere radius (XZ only — Y is small and camera angle covers it)
  let radius = 0;
  for (const p of positions.values()) {
    const dx = p.x - centroid.x;
    const dz = p.z - centroid.z;
    const d  = Math.sqrt(dx * dx + dz * dz);
    if (d > radius) radius = d;
  }

  // Minimum sensible radius so a single-room scene still frames reasonably
  const r = Math.max(radius, 6);

  // Camera sits at a 45° elevation angle, offset back along +Z.
  // 1.1× diameter keeps the entire dungeon tightly framed without the
  // previous 1.6×√2 ≈ 2.26× factor that pushed the camera ~270 units away.
  const dist = r * 1.1 * Math.SQRT2; // horizontal + vertical component
  const camPosition = new THREE.Vector3(
    centroid.x,
    centroid.y + dist * 0.6,
    centroid.z + dist
  );

  return {
    position:    camPosition,
    target:      new THREE.Vector3(centroid.x, centroid.y, centroid.z),
    maxDistance: Math.max(r * 3, 60),
    camDist:     dist,
  };
}
