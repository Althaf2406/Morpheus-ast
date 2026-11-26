/**
 * **Feature: necro-visual-polish, Property 17: Clearing selection returns to the Whole_Dungeon_View**
 * **Validates: Requirements 3.2, 3.3**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { frameCamera } from "../../../layout/frameCamera.ts";
import { createCameraGlide } from "../cameraGlide.ts";
import { roomFocusTarget } from "../roomFocus.ts";
import { createRig, positionsArb, rooms } from "./cameraRig.ts";
// --- Generators ---
const entityIds = rooms.flatMap((room) => room.entities.map((entity) => entity.entityId));
const entityIdArb = fc.constantFrom(...entityIds);
const elapsedArb = fc.double({ min: 0, max: 0.8, noNaN: true });
// --- Properties ---
describe("Property 17: clearing selection returns to the whole-dungeon view", () => {
  it("converges to the whole-dungeon pose after a focused selection is cleared", () => {
    fc.assert(
      fc.property(positionsArb, entityIdArb, (positions, entityId) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, false, positions);
        const focus = roomFocusTarget(rooms, positions, entityId);
        if (focus === null) throw new Error("no focus target");
        glide.focus(focus);
        glide.tick(0);
        glide.tick(10);
        glide.reset();
        glide.tick(20);
        glide.tick(30);
        const frame = frameCamera(positions);
        expect(camera.position.distanceTo(frame.position)).toBeLessThan(1e-6);
        expect(controls.target.distanceTo(frame.target)).toBeLessThan(1e-6);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
  it("converges to the same pose when cleared while a focus glide is still in flight", () => {
    fc.assert(
      fc.property(positionsArb, entityIdArb, elapsedArb, (positions, entityId, elapsed) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, false, positions);
        const focus = roomFocusTarget(rooms, positions, entityId);
        if (focus === null) throw new Error("no focus target");
        glide.focus(focus);
        glide.tick(0);
        glide.tick(elapsed);
        glide.reset();
        glide.tick(100);
        glide.tick(110);
        const frame = frameCamera(positions);
        expect(camera.position.distanceTo(frame.position)).toBeLessThan(1e-6);
        expect(controls.target.distanceTo(frame.target)).toBeLessThan(1e-6);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
});
