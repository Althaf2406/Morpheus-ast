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
const MIN_MAX_DISTANCE = 60;
const EMPTY_MAX_DISTANCE = 200;
const FOV_DEG = 55;       // matches CyberCityScene's PerspectiveCamera
const FIT_MARGIN = 1.1;   // breathing room around the bounding sphere
const ELEVATION_DIR = new THREE.Vector3(0, 0.6, 1).normalize();
// Aspect >= 1 (landscape): the vertical half-fov is the tighter one. Portrait is not guaranteed.
const HALF_FOV_RAD = (FOV_DEG / 2) * (Math.PI / 180);

// --- Pure framing function ---

/**
 * Computes a camera frame that shows every building with a comfortable margin.
 *
 * - Target is the centroid of all positions.
 * - Bounding radius is the largest XZ distance from the centroid.
 * - Camera sits above and back (fixed elevation) at the distance where a sphere of
 *   the bounding radius fills the vertical half-fov (r / sin(halfFov)), plus a margin.
 *   Every ground point within r of the target therefore fits for any aspect >= 1.
 * - maxDistance is 3x the radius, never below MIN_MAX_DISTANCE or 1.25x the camera distance.
 * - An empty map yields a fixed default frame with finite values.
 */
export function frameCamera(
  positions: ReadonlyMap<string, THREE.Vector3>
): CameraFrame {
  if (positions.size === 0) {
    const position = new THREE.Vector3(0, 20, 32);
    return {
      position,
      target:      new THREE.Vector3(0, 0, 0),
      maxDistance: EMPTY_MAX_DISTANCE,
      camDist:     position.length(),
    };
  }

  // --- Centroid ---
  const centroid = new THREE.Vector3();
  for (const p of positions.values()) {
    centroid.add(p);
  }
  centroid.divideScalar(positions.size);

  // --- Bounding radius (XZ plane) ---
  let radius = 0;
  for (const p of positions.values()) {
    const d = Math.hypot(p.x - centroid.x, p.z - centroid.z);
    if (d > radius) radius = d;
  }
  const r = Math.max(radius, MIN_RADIUS);

  // --- Camera placement ---
  const dist = (r / Math.sin(HALF_FOV_RAD)) * FIT_MARGIN;
  return {
    position:    centroid.clone().addScaledVector(ELEVATION_DIR, dist),
    target:      centroid,
    maxDistance: Math.max(r * 3, MIN_MAX_DISTANCE, dist * 1.25),
    camDist:     dist,
  };
}
