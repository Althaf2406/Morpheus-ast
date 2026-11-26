/**
 * Structural test for the PointLight count as the room count grows.
 *
 * **Feature: necro-visual-polish, Property 25: PointLight count never exceeds four as room count grows**
 * **Validates: Requirements 5.3, 5.8**
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import type { DungeonLayout } from "../../adapter.ts";
import { allocateTorches, bossRoomsOf, LIGHT_BUDGET } from "../../components/dungeon/torchAllocation.ts";
import { mockDungeonLayout } from "../../mock/dungeonLayout.ts";
import { buildPerfScene } from "../buildPerfScene.ts";
import { generateLayout, LARGE_ROOM_COUNT } from "../largeLayout.ts";

// --- Constants ---

const MAX_POINT_LIGHTS = 4;
const SAMPLE_ROOM_COUNT = mockDungeonLayout.rooms.length;

// --- Helpers ---

function countPointLights(layout: DungeonLayout): number {
  const built = buildPerfScene(layout);
  try {
    let lights = 0;
    built.scene.traverse((object) => {
      if (object instanceof THREE.PointLight) lights += 1;
    });
    return lights;
  } finally {
    built.dispose();
  }
}

function litSlotCount(layout: DungeonLayout): number {
  const ids = bossRoomsOf(layout).map((room) => room.id);
  return allocateTorches(ids).filter((slot) => slot.lit).length;
}

describe("PointLight count performance", () => {
  it("keeps the budget constant at four", () => {
    expect(LIGHT_BUDGET).toBe(MAX_POINT_LIGHTS);
  });

  it("holds at most four lights for the sample dungeon and the Large_Layout", () => {
    expect(countPointLights(mockDungeonLayout)).toBeLessThanOrEqual(MAX_POINT_LIGHTS);
    expect(countPointLights(generateLayout(LARGE_ROOM_COUNT))).toBeLessThanOrEqual(MAX_POINT_LIGHTS);
  });

  it("holds at most four lights and matches the lit allocation for any room count", () => {
    fc.assert(
      fc.property(fc.integer({ min: SAMPLE_ROOM_COUNT, max: LARGE_ROOM_COUNT }), (roomCount) => {
        const layout = generateLayout(roomCount);
        const lights = countPointLights(layout);
        expect(lights).toBeLessThanOrEqual(MAX_POINT_LIGHTS);
        expect(lights).toBe(litSlotCount(layout));
      }),
      { numRuns: 20 },
    );
  });
});
