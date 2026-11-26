/**
 * Property-based test for the single Ember_Field.
 *
 * **Feature: necro-visual-polish, Property 14: Scene has exactly one Ember_Field**
 * **Validates: Requirements 2.12**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import type { DungeonLayout, DungeonRoom, RoomSize } from "../../../adapter.ts";
import { createEmberField, EMBER_COUNT, type EmberBounds } from "../emberField.ts";
import { bossRoomsOf } from "../torchAllocation.ts";
import { createTorches, type TorchRoom } from "../torches.ts";

// --- Generators ---

const sizeArb: fc.Arbitrary<RoomSize> = fc.constantFrom("SMALL", "MEDIUM", "LARGE", "BOSS");

const layoutArb: fc.Arbitrary<DungeonLayout> = fc
  .array(sizeArb, { maxLength: 20 })
  .map((sizes) => {
    const rooms: DungeonRoom[] = sizes.map((size, index) => ({
      id: `room-${String(index + 1).padStart(3, "0")}`,
      functionName: `fn${index}`,
      filePath: "src/file.ts",
      size,
      cyclomaticComplexity: 3,
      isCircularDep: false,
      entities: [],
      corridorIds: [],
    }));
    return {
      rooms,
      corridors: [],
      totalEntities: 0,
      bossRoomIds: rooms.filter((room) => room.size === "BOSS").map((room) => room.id),
    };
  });

// --- Helpers ---

/** Builds the atmosphere the way AtmosphereLayer does: torches plus one ember field. */
function buildScene(layout: DungeonLayout): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  const rooms: TorchRoom[] = bossRoomsOf(layout).map((room) => ({
    id: room.id,
    origin: { x: layout.rooms.indexOf(room) * 10, y: 0, z: 0 },
    extent: [8, 5, 8],
  }));
  const bounds: EmberBounds = { min: [0, 0, 0], max: [Math.max(layout.rooms.length, 1) * 10, 5, 8] };
  const torches = createTorches(scene, rooms, false);
  const embers = createEmberField(scene, bounds);
  return {
    scene,
    dispose: () => {
      torches.dispose();
      embers.dispose();
    },
  };
}

function countEmberFields(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Points) count += 1;
  });
  return count;
}

// --- Property ---

describe("Property 14: scene has exactly one Ember_Field", () => {
  it("contains exactly one Points object with the fixed particle count for any layout", () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const { scene, dispose } = buildScene(layout);
        try {
          expect(countEmberFields(scene)).toBe(1);
          const points = scene.children.find((child): child is THREE.Points => child instanceof THREE.Points);
          expect(points?.geometry.getAttribute("position").count).toBe(EMBER_COUNT);
        } finally {
          dispose();
        }
      }),
      { numRuns: 100 },
    );
  });
});
