/**
 * Property-based test for the light allocation rule and budget.
 *
 * **Feature: necro-visual-polish, Property 9: Light allocation follows the room-count rule and the budget**
 * **Validates: Requirements 2.4, 2.7, 2.8, 2.9**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { allocateTorches, LIGHT_BUDGET } from "../torchAllocation.ts";
import type { TorchSlot } from "../torchAllocation.ts";

// --- Helpers ---

const idsArb = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 12 });

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function litOf(slots: readonly TorchSlot[]): TorchSlot[] {
  return slots.filter((slot) => slot.lit);
}

// --- Property ---

describe("Property 9: light allocation follows the room-count rule and the budget", () => {
  it("never lights more than the budget and lights nothing without Boss_Rooms", () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const lit = litOf(allocateTorches(ids));
        expect(lit.length).toBeLessThanOrEqual(LIGHT_BUDGET);
        if (ids.length === 0) expect(lit).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("lights all four corners when there is exactly one Boss_Room", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (id) => {
        const slots = allocateTorches([id]);
        expect(slots).toHaveLength(4);
        expect(slots.every((slot) => slot.lit)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("lights only the back corners of each room when there are exactly two Boss_Rooms", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 2, maxLength: 2 }), (ids) => {
        const slots = allocateTorches(ids);
        for (const slot of slots) {
          expect(slot.lit).toBe(slot.corner === "BACK_LEFT" || slot.corner === "BACK_RIGHT");
        }
        expect(litOf(slots)).toHaveLength(4);
      }),
      { numRuns: 100 },
    );
  });

  it("lights only back-left of the first four sorted rooms when there are more than two", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 3, maxLength: 12 }), (ids) => {
        const firstFour = new Set(sortedIds(ids).slice(0, LIGHT_BUDGET));
        for (const slot of allocateTorches(ids)) {
          expect(slot.lit).toBe(slot.corner === "BACK_LEFT" && firstFour.has(slot.roomId));
        }
        expect(litOf(allocateTorches(ids))).toHaveLength(Math.min(ids.length, LIGHT_BUDGET));
      }),
      { numRuns: 100 },
    );
  });
});
