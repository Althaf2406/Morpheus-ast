/**
 * Property-based tests for the camera frame.
 *
 * **Validates: Requirements 2.10**
 *
 * Property 5 — The computed camera frame keeps every building in view.
 */

import * as fc from "fast-check";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { frameCamera } from "../frameCamera.ts";

// --- Constants ---

const FOV_DEG = 55; // matches CyberCityScene's PerspectiveCamera
const ASPECT = 16 / 9;
const NEAR = 0.1;
const FAR = 10_000;

// --- Arbitraries ---

const coord = fc.double({ min: -200, max: 200, noNaN: true, noDefaultInfinity: true });

const positionMapArb: fc.Arbitrary<Map<string, THREE.Vector3>> = fc
  .uniqueArray(fc.tuple(fc.hexaString({ minLength: 1, maxLength: 8 }), coord, coord), {
    minLength: 1,
    maxLength: 60,
    selector: ([id]) => id,
  })
  .map((rows) => new Map(rows.map(([id, x, z]) => [id, new THREE.Vector3(x, 0, z)])));

// --- Helpers ---

function frustumFor(position: THREE.Vector3, target: THREE.Vector3): THREE.Frustum {
  const camera = new THREE.PerspectiveCamera(FOV_DEG, ASPECT, NEAR, FAR);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return new THREE.Frustum().setFromProjectionMatrix(m);
}

function isFiniteVec(v: THREE.Vector3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

// --- Tests ---

describe("Property 5: camera frame keeps every building in view", () => {
  it("places every position inside the view frustum of the frame", () => {
    fc.assert(
      fc.property(positionMapArb, (positions) => {
        const frame = frameCamera(positions);
        const frustum = frustumFor(frame.position, frame.target);
        for (const p of positions.values()) {
          if (!frustum.containsPoint(p)) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });

  it("returns finite values with a positive camDist and maxDistance", () => {
    fc.assert(
      fc.property(positionMapArb, (positions) => {
        const frame = frameCamera(positions);
        return (
          isFiniteVec(frame.position) &&
          isFiniteVec(frame.target) &&
          Number.isFinite(frame.camDist) &&
          Number.isFinite(frame.maxDistance) &&
          frame.camDist > 0 &&
          frame.maxDistance > 0
        );
      }),
      { numRuns: 200 }
    );
  });

  it("returns a finite default frame for an empty map", () => {
    const frame = frameCamera(new Map<string, THREE.Vector3>());
    expect(isFiniteVec(frame.position)).toBe(true);
    expect(isFiniteVec(frame.target)).toBe(true);
    expect(Number.isFinite(frame.camDist)).toBe(true);
    expect(Number.isFinite(frame.maxDistance)).toBe(true);
  });
});
