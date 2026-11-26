/**
 * Performance test for entity placement on the Large_Layout.
 *
 * **Feature: necro-visual-polish, Property 21: Entity placement stays within the Large_Layout time budget**
 * **Validates: Requirements 5.2, 5.4**
 */
import { describe, it, expect } from "vitest";
import { ROOM_SCALE } from "../../components/dungeon/DungeonRooms.tsx";
import { placeRoomEntities } from "../../entities/entityPlacement.ts";
import { computeForceLayout } from "../../layout/forceLayout.ts";
import { largeLayout } from "../largeLayout.ts";
import { medianOfFive } from "../measure.ts";

// --- Constants ---

const BUDGET_MS = 100;

// --- Fixture: positions are computed once, outside the timed section ---

const positions = computeForceLayout(largeLayout.rooms, largeLayout.corridors).positions;

function placeAllRooms(): number {
  let placedCount = 0;
  for (const room of largeLayout.rooms) {
    const origin = positions.get(room.id);
    if (origin == null) continue;
    placedCount += placeRoomEntities(room.entities, origin, ROOM_SCALE[room.size], room.size === "BOSS").length;
  }
  return placedCount;
}

describe("entity placement performance", () => {
  it("places every entity of the Large_Layout and stays within the median budget", () => {
    expect(placeAllRooms()).toBe(largeLayout.totalEntities);

    const median = medianOfFive(() => {
      placeAllRooms();
    });

    expect(median).toBeLessThanOrEqual(BUDGET_MS);
  });
});
