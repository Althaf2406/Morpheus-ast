/**
 * **Feature: necro-visual-polish, Property 11: Scene PointLight count equals the lit allocation and never exceeds four**
 * **Validates: Requirements 2.4, 2.5**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import type { DungeonLayout, DungeonRoom, RoomSize } from "../../../adapter.ts";
import { allocateTorches, bossRoomsOf, LIGHT_BUDGET } from "../torchAllocation.ts";
import { createTorches, type TorchRoom } from "../torches.ts";

// --- Generators ---

const EXTENT: Readonly<Record<RoomSize, readonly [number, number, number]>> = {
  SMALL: [5.7, 4.8, 5.7],
  MEDIUM: [8.7, 6.6, 8.7],
  LARGE: [6, 4, 6],
  BOSS: [8, 5, 8],
};

const sizeArb: fc.Arbitrary<RoomSize> = fc.constantFrom("SMALL", "MEDIUM", "LARGE", "BOSS");

const layoutArb: fc.Arbitrary<DungeonLayout> = fc
  .array(sizeArb, { maxLength: 20 })
  .map((sizes) => {
    const rooms: DungeonRoom[] = sizes.map((size, index) => ({
      id: `room-${String(index + 1).padStart(3, "0")}`,
      functionName: `fn${index}`,
      filePath: "src/file.ts",
      size,
      cyclomaticComplexity: size === "BOSS" ? 20 : 3,
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

function torchRoomsOf(layout: DungeonLayout): TorchRoom[] {
  return bossRoomsOf(layout).map((room) => {
    const index = layout.rooms.indexOf(room);
    return { id: room.id, origin: { x: index * 10, y: 0, z: 0 }, extent: [...EXTENT[room.size]] as [number, number, number] };
  });
}

function pointLightsIn(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.PointLight) count += 1;
  });
  return count;
}

function buildLightCount(layout: DungeonLayout): number {
  const scene = new THREE.Scene();
  const torches = createTorches(scene, torchRoomsOf(layout), false);
  try {
    return pointLightsIn(scene);
  } finally {
    torches.dispose();
  }
}

// --- Properties ---

describe("Property 11: scene PointLight count", () => {
  it("equals the lit allocation and never exceeds the light budget", () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const lit = allocateTorches(bossRoomsOf(layout).map((room) => room.id)).filter((slot) => slot.lit).length;
        const count = buildLightCount(layout);
        expect(count).toBe(lit);
        expect(count).toBeLessThanOrEqual(LIGHT_BUDGET);
      }),
      { numRuns: 100 },
    );
  });

  it("does not change when non-boss rooms are added", () => {
    fc.assert(
      fc.property(layoutArb, fc.integer({ min: 1, max: 10 }), (layout, extra) => {
        const added: DungeonRoom[] = Array.from({ length: extra }, (_, i) => ({
          id: `room-x${String(i).padStart(3, "0")}`,
          functionName: `extra${i}`,
          filePath: "src/extra.ts",
          size: "MEDIUM",
          cyclomaticComplexity: 3,
          isCircularDep: false,
          entities: [],
          corridorIds: [],
        }));
        const grown: DungeonLayout = { ...layout, rooms: [...layout.rooms, ...added] };
        expect(buildLightCount(grown)).toBe(buildLightCount(layout));
      }),
      { numRuns: 100 },
    );
  });
});
