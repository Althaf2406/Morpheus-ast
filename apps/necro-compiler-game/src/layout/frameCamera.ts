import * as THREE from "three";

// --- Types ---

export interface CameraFrame {
  /** Suggested camera world position. */
  readonly position:    THREE.Vector3;
  /** Point the camera should look at. */
  readonly target:      THREE.Vector3;
  /** Recommended OrbitControls maxDistance. */
  readonly maxDistance: number;
  /** Distance from position to target, used for scene-relative fog. */
  readonly camDist:     number;
}

// --- Constants ---

const MIN_RADIUS = 6;
/** Camera-to-target distance as a multiple of the bounding radius: a small margin around the footprint. */
const DISTANCE_FACTOR = 1.2;
/** Camera height as a fraction of its horizontal offset. */
const ELEVATION_RATIO = 0.6;

// --- Pure framing function ---

/**
 * Computes a camera pose that frames the whole dungeon with a small margin.
 *
 * Rules:
 *  - Target is the centroid of all positions.
 *  - Bounding radius is the largest XZ distance from the centroid to a position,
 *    plus that position's `reach` (the room's footprint radius, 0 when absent).
 *  - Camera sits above and back (+Z) at DISTANCE_FACTOR times the radius.
 *  - maxDistance is 3x the radius, to allow zooming out further.
 */
export function frameCamera(
  positions: ReadonlyMap<string, THREE.Vector3>,
  reach: ReadonlyMap<string, number> = new Map(),
): CameraFrame {
  if (positions.size === 0) {
    const position = new THREE.Vector3(0, 20, 32);
    return {
      position,
      target:      new THREE.Vector3(0, 0, 0),
      maxDistance: 200,
      camDist:     position.length(),
    };
  }

  const centroid = new THREE.Vector3();
  for (const p of positions.values()) {
    centroid.add(p);
  }
  centroid.divideScalar(positions.size);

  let radius = 0;
  for (const [id, p] of positions) {
    const d = Math.hypot(p.x - centroid.x, p.z - centroid.z) + (reach.get(id) ?? 0);
    if (d > radius) radius = d;
  }

  const r = Math.max(radius, MIN_RADIUS);
  const length = r * DISTANCE_FACTOR;
  const offset = length / Math.hypot(1, ELEVATION_RATIO);
  const position = new THREE.Vector3(
    centroid.x,
    centroid.y + offset * ELEVATION_RATIO,
    centroid.z + offset,
  );

  return {
    position,
    target:      centroid,
    maxDistance: Math.max(r * 3, 60),
    camDist:     position.distanceTo(centroid),
  };
}
