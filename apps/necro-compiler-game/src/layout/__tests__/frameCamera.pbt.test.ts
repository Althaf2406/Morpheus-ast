/**
 * Property-based tests for the frameCamera utility.
 *
 * **Validates: Requirements REQ-NC-CAM-001**
 *
 * Two properties under test:
 *   P1 — All output components are finite for any finite input positions.
 *   P2 — Camera distance from target exceeds the bounding sphere radius.
 */

import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { frameCamera } from "../frameCamera.ts";

// --- Arbitrary: a map of 1–20 finite 3D positions ---

const positionsArb: fc.Arbitrary<ReadonlyMap<string, THREE.Vector3>> = fc
  .array(
    fc.record({
      id: fc.uuid(),
      x:  fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
      y:  fc.double({ min: -50,  max: 50,  noNaN: true, noDefaultInfinity: true }),
      z:  fc.double({ min: -500, max: 500, noNaN: true, noDefaultInfinity: true }),
    }),
    { minLength: 1, maxLength: 20 }
  )
  .map(
    (entries) =>
      new Map(entries.map((e) => [e.id, new THREE.Vector3(e.x, e.y, e.z)]))
  );

// ─── P1 — Finite output ───────────────────────────────────────────────────────

describe("P1 — Finite output", () => {
  it("all camera frame components are finite for any finite input", () => {
    fc.assert(
      fc.property(positionsArb, (positions) => {
        const frame = frameCamera(positions);

        expect(Number.isFinite(frame.position.x),    "position.x not finite").toBe(true);
        expect(Number.isFinite(frame.position.y),    "position.y not finite").toBe(true);
        expect(Number.isFinite(frame.position.z),    "position.z not finite").toBe(true);
        expect(Number.isFinite(frame.target.x),      "target.x not finite").toBe(true);
        expect(Number.isFinite(frame.target.y),      "target.y not finite").toBe(true);
        expect(Number.isFinite(frame.target.z),      "target.z not finite").toBe(true);
        expect(Number.isFinite(frame.maxDistance),   "maxDistance not finite").toBe(true);
        expect(frame.maxDistance).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });
});

// ─── P2 — Camera farther than bounding sphere radius ─────────────────────────

describe("P2 — Camera farther than bounding sphere radius", () => {
  it("camera distance from target exceeds the bounding sphere radius", () => {
    fc.assert(
      fc.property(positionsArb, (positions) => {
        const frame = frameCamera(positions);

        // Recompute bounding sphere radius the same way frameCamera does
        const centroid = new THREE.Vector3();
        for (const p of positions.values()) centroid.add(p);
        centroid.divideScalar(positions.size);

        let radius = 0;
        for (const p of positions.values()) {
          const dx = p.x - centroid.x;
          const dz = p.z - centroid.z;
          const d  = Math.sqrt(dx * dx + dz * dz);
          if (d > radius) radius = d;
        }

        const camDist = frame.position.distanceTo(frame.target);
        expect(
          camDist,
          `camera dist (${camDist.toFixed(2)}) not > bounding radius (${radius.toFixed(2)})`
        ).toBeGreaterThan(radius);
      }),
      { numRuns: 200 }
    );
  });
});
