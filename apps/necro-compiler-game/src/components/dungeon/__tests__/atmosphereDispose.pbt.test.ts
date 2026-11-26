/**
 * Property-based test for atmosphere resource disposal.
 *
 * **Feature: necro-visual-polish, Property 15: Dungeon_Scene disposal releases every created resource**
 * **Validates: Requirements 2.16**
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

// --- Helpers ---

/** Counts `dispose` events dispatched by a geometry or material. */
function countDisposals(resource: THREE.BufferGeometry | THREE.Material): () => number {
  let count = 0;
  resource.addEventListener("dispose", () => {
    count += 1;
  });
  return () => count;
}

function meshResources(mesh: THREE.Mesh | THREE.Points) {
  const material = mesh.material;
  if (Array.isArray(material)) throw new Error("unexpected material array");
  return { geometry: mesh.geometry, material };
}

// --- Property ---

describe("Property 15: disposal releases every created resource", () => {
  it("disposes each geometry and material once and removes every object from the scene", () => {
    fc.assert(
      fc.property(fc.boolean(), roomsArb, (reducedMotion, rooms) => {
        const scene = new THREE.Scene();
        const torches = createTorches(scene, rooms, reducedMotion);
        const embers = createEmberField(scene, { min: [-10, 0, -10], max: [10, 5, 10] });
        const tracked = [meshResources(torches.flames), meshResources(embers.points)].flatMap(
          ({ geometry, material }) => [countDisposals(geometry), countDisposals(material)],
        );

        torches.dispose();
        embers.dispose();

        expect(tracked.map((count) => count())).toEqual([1, 1, 1, 1]);
        expect(scene.children).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});
