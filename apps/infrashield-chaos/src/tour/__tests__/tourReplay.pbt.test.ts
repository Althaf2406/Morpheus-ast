import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { INITIAL_TOUR_STATE, tourReducer } from "../tourState";
import type { TourAction } from "../tourState";

// --- Generators ---
const actionArb: fc.Arbitrary<TourAction> = fc.constantFrom<TourAction>(
  { type: "START" },
  { type: "NEXT" },
  { type: "BACK" },
  { type: "DISMISS" },
);

// Feature: tour, Property 5: Replay always restarts at step 1
describe("Property 5: Replay always restarts at step 1", () => {
  it("**Validates: Requirements 12.2, 15.5** any action sequence followed by START yields {visible: true, step: 1}", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 50 }), (actions) => {
        const before = actions.reduce(tourReducer, INITIAL_TOUR_STATE);
        const after = tourReducer(before, { type: "START" });
        expect(after).toEqual({ visible: true, step: 1 });
      }),
      { numRuns: 200 },
    );
  });
});
