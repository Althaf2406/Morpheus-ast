/**
 * **Feature: necro-visual-polish, Property 19: Manual input cancels an in-progress glide**
 * **Validates: Requirements 3.5**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { createCameraGlide } from "../cameraGlide.ts";
import { createRig } from "./cameraRig.ts";
// --- Generators ---
const coordinate = fc.double({ min: -200, max: 200, noNaN: true });
const pointArb = fc.tuple(coordinate, coordinate, coordinate).map(([x, y, z]) => new THREE.Vector3(x, y, z));
const positionsArb: fc.Arbitrary<ReadonlyMap<string, THREE.Vector3>> = fc
  .array(pointArb, { minLength: 1, maxLength: 8 })
  .map((points) => new Map(points.map((p, i) => [`room-${i}`, p])));
const glideKindArb = fc.constantFrom("focus", "reset");
const elapsedArb = fc.double({ min: 0.05, max: 0.8, noNaN: true });
const laterTicksArb = fc.array(fc.double({ min: 0, max: 20, noNaN: true }), { minLength: 1, maxLength: 5 });
// --- Properties ---
describe("Property 19: manual input cancels an in-progress glide", () => {
  it("leaves the camera at its current pose after a manual start event", () => {
    fc.assert(
      fc.property(positionsArb, glideKindArb, pointArb, elapsedArb, laterTicksArb, (positions, kind, focus, elapsed, later) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, false, positions);
        if (kind === "focus") glide.focus(focus);
        else glide.reset();
        glide.tick(0);
        glide.tick(elapsed);
        const position = camera.position.clone();
        const target = controls.target.clone();
        controls.dispatchEvent({ type: "start" });
        for (const dt of later) glide.tick(elapsed + dt);
        expect(camera.position.equals(position)).toBe(true);
        expect(controls.target.equals(target)).toBe(true);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
  it("still lets a new glide run after a cancelled one", () => {
    const { camera, controls } = createRig();
    const positions = new Map([["room-0", new THREE.Vector3(5, 0, 5)]]);
    const glide = createCameraGlide(camera, controls, false, positions);
    const target = new THREE.Vector3(30, 2, -10);
    glide.focus(target);
    glide.tick(0);
    controls.dispatchEvent({ type: "start" });
    glide.focus(target);
    glide.tick(0);
    glide.tick(10);
    expect(controls.target.distanceTo(target)).toBeLessThan(1e-6);
    glide.dispose();
    controls.dispose();
  });
});
