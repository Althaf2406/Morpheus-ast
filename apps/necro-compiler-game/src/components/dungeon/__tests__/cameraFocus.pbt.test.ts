/**
 * **Feature: necro-visual-polish, Property 16: Selecting a monster glides the camera to its room**
 * **Validates: Requirements 3.1**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { createCameraGlide } from "../cameraGlide.ts";
import { ROOM_SCALE } from "../DungeonRooms.tsx";
import { roomFocusTarget } from "../roomFocus.ts";
import { createRig, positionsArb, rooms } from "./cameraRig.ts";
// --- Generators ---
const entityIds = rooms.flatMap((room) => room.entities.map((entity) => entity.entityId));
const entityIdArb = fc.constantFrom(...entityIds);
// --- Properties ---
describe("Property 16: selecting a monster glides the camera to its room", () => {
  it("targets the centre of the room that contains the selected entity", () => {
    fc.assert(
      fc.property(positionsArb, entityIdArb, (positions, entityId) => {
        const room = rooms.find((r) => r.entities.some((e) => e.entityId === entityId));
        if (room === undefined) throw new Error("entity without room");
        const origin = positions.get(room.id);
        if (origin === undefined) throw new Error("room without position");
        const target = roomFocusTarget(rooms, positions, entityId);
        expect(target).not.toBeNull();
        expect(target?.x).toBeCloseTo(origin.x);
        expect(target?.y).toBeCloseTo(origin.y + ROOM_SCALE[room.size][1] / 2);
        expect(target?.z).toBeCloseTo(origin.z);
      }),
      { numRuns: 100 }
    );
  });
  it("converges the camera controls to that target once the glide finishes", () => {
    fc.assert(
      fc.property(positionsArb, entityIdArb, (positions, entityId) => {
        const { camera, controls } = createRig();
        const glide = createCameraGlide(camera, controls, false, positions);
        const target = roomFocusTarget(rooms, positions, entityId);
        if (target === null) throw new Error("no focus target");
        glide.focus(target);
        glide.tick(0);
        glide.tick(10);
        expect(controls.target.distanceTo(target)).toBeLessThan(1e-6);
        glide.dispose();
        controls.dispose();
      }),
      { numRuns: 100 }
    );
  });
  it("returns null for an unknown entity", () => {
    expect(roomFocusTarget(rooms, new Map(), "missing")).toBeNull();
  });
});
