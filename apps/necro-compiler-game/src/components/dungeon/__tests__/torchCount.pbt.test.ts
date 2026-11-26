/**
 * Property-based test for the torch count per Boss_Room.
 *
 * **Feature: necro-visual-polish, Property 8: Every Boss_Room gets exactly four torches**
 * **Validates: Requirements 2.3**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { allocateTorches } from "../torchAllocation.ts";
// --- Property ---
const CORNERS = ["BACK_LEFT", "BACK_RIGHT", "FRONT_LEFT", "FRONT_RIGHT"];

describe("Property 8: every Boss_Room gets exactly four torches", () => {
  it("returns four slots per id, one per corner, so the total is four times the room count", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 })), (ids) => {
        const slots = allocateTorches(ids);
        expect(slots).toHaveLength(ids.length * 4);
        for (const id of ids) {
          const corners = slots.filter((slot) => slot.roomId === id).map((slot) => slot.corner);
          expect([...corners].sort()).toEqual([...CORNERS].sort());
        }
      }),
      { numRuns: 100 },
    );
  });
});
