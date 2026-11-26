/**
 * **Feature: necro-visual-polish, Property 18: Reduced motion makes camera glides instantaneous**
 * **Validates: Requirements 3.4**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { frameCamera } from "../../../layout/frameCamera.ts";
import { createCameraGlide } from "../cameraGlide.ts";
import { coordinate, createRig, positionsArb } from "./cameraRig.ts";
// --- Generators ---
const targetArb = fc.tuple(coordinate, coordinate, coordinate).map(([x, y, z]) => new THREE.Vector3(x, y, z));
// --- Properties ---
describe("Property 18: reduced motion makes camera glides instantaneous", () => {
  it("places the controls target on the focus target as soon as focus is requested", () => {
    fc.assert(
      fc.property(positionsArb, targetArb, (positions, target) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, true, positions);
        glide.focus(target);
        expect(controls.target.distanceTo(target)).toBeLessThan(1e-9);
        expect(camera.position.distanceTo(target)).toBeGreaterThan(0);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
  it("places the camera on the whole-dungeon pose as soon as reset is requested", () => {
    fc.assert(
      fc.property(positionsArb, targetArb, (positions, target) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, true, positions);
        glide.focus(target);
        glide.reset();
        const overview = frameCamera(positions);
        expect(camera.position.distanceTo(overview.position)).toBeLessThan(1e-9);
        expect(controls.target.distanceTo(overview.target)).toBeLessThan(1e-9);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
  it("does not move the camera further on later ticks", () => {
    fc.assert(
      fc.property(positionsArb, targetArb, (positions, target) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, true, positions);
        glide.focus(target);
        const position = camera.position.clone();
        glide.tick(0);
        glide.tick(0.4);
        expect(camera.position.equals(position)).toBe(true);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
});
