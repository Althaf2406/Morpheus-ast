/**
 * Property-based test for frozen atmosphere under Reduced_Motion.
 *
 * **Feature: necro-visual-polish, Property 13: Reduced motion freezes atmosphere animation**
 * **Validates: Requirements 2.15**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { createEmberField } from "../emberField.ts";
import { createTorches, type TorchRoom } from "../torches.ts";

// --- Generators ---

const coord = fc.double({ min: -50, max: 50, noNaN: true });
const roomsArb = fc.array(
  fc.record({
    origin: fc.record({ x: coord, y: coord, z: coord }),
    extent: fc.tuple(
      fc.double({ min: 2, max: 20, noNaN: true }),
      fc.double({ min: 2, max: 20, noNaN: true }),
      fc.double({ min: 2, max: 20, noNaN: true }),
    ),
  }),
  { maxLength: 5 },
).map((rooms): TorchRoom[] => rooms.map((room, i) => ({ id: `room-${i}`, ...room })));
const timeArb = fc.double({ min: 0, max: 10_000, noNaN: true });

// --- Helpers ---

/** Mirrors AtmosphereLayer: under Reduced_Motion no tick is ever invoked. */
function snapshot(torchRooms: readonly TorchRoom[], time: number) {
  const scene = new THREE.Scene();
  const torches = createTorches(scene, torchRooms, true);
  const embers = createEmberField(scene, { min: [-10, 0, -10], max: [10, 5, 10] });
  torches.tick?.(time);
  const result = {
    hasTick: torches.tick != null,
    intensities: torches.lights.map((light) => light.intensity),
    flameColors: Array.from(torches.flames.instanceColor?.array ?? []),
    positions: Array.from(embers.points.geometry.getAttribute("position").array),
  };
  torches.dispose();
  embers.dispose();
  return result;
}

// --- Property ---

describe("Property 13: reduced motion freezes atmosphere animation", () => {
  it("keeps torch intensities, flame colours and ember positions identical at any two times", () => {
    fc.assert(
      fc.property(roomsArb, timeArb, timeArb, (rooms, t1, t2) => {
        const a = snapshot(rooms, t1);
        const b = snapshot(rooms, t2);
        expect(a.hasTick).toBe(false);
        expect(b).toEqual(a);
      }),
      { numRuns: 100 },
    );
  });
});
