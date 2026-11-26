import * as THREE from "three";
import { buildingHeight, buildingWidth } from "./buildingScale.ts";

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
 * Computes a camera frame that shows every building, including its footprint and height.
 *
 * - Building size comes from `complexities` (node id to complexity); a missing id counts as 0.
 * - Target is the XZ centroid of all positions, at half the tallest building height.
 * - Bounding radius is the largest distance from the target to any building corner.
 * - Camera sits above and back (fixed elevation) at the distance where a sphere of
 *   the bounding radius fills the vertical half-fov (r / sin(halfFov)), plus a margin.
 *   The whole sphere therefore fits for any aspect >= 1.
 * - maxDistance is 3x the radius, never below MIN_MAX_DISTANCE or 1.25x the camera distance.
 * - An empty map yields a fixed default frame with finite values.
 */
export function frameCamera(
  positions: ReadonlyMap<string, THREE.Vector3>,
  complexities: ReadonlyMap<string, number> = new Map()
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

  // --- Target: XZ centroid at mid-height of the tallest building ---
  const centroid = new THREE.Vector3();
  let tallest = 0;
  for (const [id, p] of positions) {
    centroid.add(p);
    tallest = Math.max(tallest, buildingHeight(complexities.get(id) ?? 0));
  }
  centroid.divideScalar(positions.size);
  centroid.y = tallest / 2;
  // --- Bounding radius: farthest building corner, base or roof ---
  let radius = 0;
  for (const [id, p] of positions) {
    const complexity = complexities.get(id) ?? 0;
    const reach = Math.hypot(p.x - centroid.x, p.z - centroid.z) + (buildingWidth(complexity) / 2) * Math.SQRT2;
    const vertical = Math.max(buildingHeight(complexity) - centroid.y, centroid.y);
    radius = Math.max(radius, Math.hypot(reach, vertical));
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
