/**
 * Draw_Call_Count stability from the sample dungeon up to the Large_Layout.
 *
 * **Feature: necro-visual-polish, Property 24: Draw_Call_Count does not grow with room count**
 * **Validates: Requirements 5.3, 5.7**
 */
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { mockDungeonLayout } from "../../mock/dungeonLayout.ts";
import { buildPerfScene } from "../buildPerfScene.ts";
import { countDrawCalls, type DrawCallCount } from "../countDrawCalls.ts";
import { generateLayout, LARGE_ROOM_COUNT } from "../largeLayout.ts";
import type { DungeonLayout } from "../../adapter.ts";

// --- Constants ---

const SAMPLE_ROOM_COUNT = mockDungeonLayout.rooms.length;
const NUM_RUNS = 100;

// --- Helper: build, count, release ---

function drawCallsOf(layout: DungeonLayout): DrawCallCount {
  const built = buildPerfScene(layout);
  try {
    return countDrawCalls(built.scene);
  } finally {
    built.dispose();
  }
}

// --- Baseline captured at test time, never a literal ---

const sampleCount = drawCallsOf(mockDungeonLayout);

describe("Draw_Call_Count stability", () => {
  it("sample dungeon has at least one Boss_Room and a non-zero count", () => {
    expect(mockDungeonLayout.bossRoomIds.length).toBeGreaterThan(0);
    expect(sampleCount.total).toBeGreaterThan(0);
  });

  it("equals the sample count for the 300-room Large_Layout", () => {
    const large = drawCallsOf(generateLayout(LARGE_ROOM_COUNT));
    expect(large.total).toBe(sampleCount.total);
  });

  it("equals the sample count for any room count between the sample size and 300", () => {
    fc.assert(
      fc.property(fc.integer({ min: SAMPLE_ROOM_COUNT, max: LARGE_ROOM_COUNT }), (roomCount) => {
        const layout = generateLayout(roomCount);
        expect(layout.bossRoomIds.length).toBeGreaterThan(0);
        expect(drawCallsOf(layout).total).toBe(sampleCount.total);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
