/**
 * Property 7: Boss_Room identification matches the layout rule.
 * **Validates: Requirements 2.3, 2.6**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { DungeonLayout, DungeonRoom, RoomSize } from "../../../adapter.ts";
import { mockDungeonLayout } from "../../../mock/dungeonLayout.ts";
import { bossRoomsOf } from "../torchAllocation.ts";

// --- Generators ---

const BOSS_THRESHOLD = 15;

function sizeFromComplexity(complexity: number): RoomSize {
  if (complexity >= BOSS_THRESHOLD) return "BOSS";
  if (complexity >= 10) return "LARGE";
  if (complexity >= 5) return "MEDIUM";
  return "SMALL";
}

const layoutArb: fc.Arbitrary<DungeonLayout> = fc
  .array(fc.integer({ min: 1, max: 40 }), { maxLength: 12 })
  .map((complexities) => {
    const rooms: DungeonRoom[] = complexities.map((cyclomaticComplexity, index) => ({
      id: `room-${String(index + 1).padStart(3, "0")}`,
      functionName: `fn${index}`,
      filePath: "src/file.ts",
      size: sizeFromComplexity(cyclomaticComplexity),
      cyclomaticComplexity,
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

// --- Properties ---

describe("Property 7: Boss_Room identification", () => {
  it("returns exactly the BOSS rooms, whose ids equal layout.bossRoomIds", () => {
    fc.assert(
      fc.property(layoutArb, (layout) => {
        const bosses = bossRoomsOf(layout);
        expect(bosses.every((room) => room.size === "BOSS")).toBe(true);
        expect(bosses.map((room) => room.id)).toEqual(layout.bossRoomIds);
        const expected = layout.rooms.filter((room) => room.cyclomaticComplexity >= BOSS_THRESHOLD);
        expect(bosses).toEqual(expected);
      }),
    );
  });

  it("returns room-001 and room-002 for the sample layout", () => {
    expect(bossRoomsOf(mockDungeonLayout).map((room) => room.id)).toEqual(["room-001", "room-002"]);
  });
});
