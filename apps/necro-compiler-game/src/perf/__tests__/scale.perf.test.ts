/**
 * Perf test: Scale_Function evaluation over every entity of the Large_Layout.
 *
 * **Feature: necro-visual-polish, Property 22: Scale_Function evaluation stays within the Large_Layout time budget**
 * **Validates: Requirements 5.2, 5.5**
 */
import { describe, it, expect } from "vitest";
import { bossMonsterId, monsterRadius, scaleFor, wallHeightFor } from "../../entities/scale.ts";
import { severityScale } from "../../entities/monsterConfig.ts";
import type { Extent } from "../../entities/entityPlacement.ts";
import { largeLayout } from "../largeLayout.ts";
import { medianOfFive } from "../measure.ts";

// --- Budget ---
const BUDGET_MS = 30;

// --- Evaluation: scaleFor and monsterRadius once per entity, returns a sink to keep the work observable ---
function evaluateAll(): number {
  let sink = 0;
  largeLayout.rooms.forEach((room, index) => {
    const extent: Extent = [8, 6 + (index % 5), 8];
    const wallHeight = wallHeightFor(extent);
    const bossId = room.size === "BOSS" ? bossMonsterId(room.entities) : null;
    for (const entity of room.entities) {
      sink += scaleFor(wallHeight).pillarHeight;
      sink += monsterRadius(wallHeight, entity.entityId === bossId, severityScale(entity.severity));
    }
  });
  return sink;
}

describe("Scale_Function perf on Large_Layout", () => {
  it("evaluates every entity within the time budget", () => {
    expect(largeLayout.totalEntities).toBeGreaterThan(0);
    let sink = 0;
    const median = medianOfFive(() => {
      sink = evaluateAll();
    });
    expect(sink).toBeGreaterThan(0);
    expect(median).toBeLessThanOrEqual(BUDGET_MS);
  });
});
