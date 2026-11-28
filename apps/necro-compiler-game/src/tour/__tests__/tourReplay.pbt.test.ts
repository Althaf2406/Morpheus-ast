import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  INITIAL_TOUR_STATE,
  tourReducer,
  type TourAction,
  type TourState,
} from "../tourState";

const actionArb: fc.Arbitrary<TourAction> = fc.constantFrom<TourAction>(
  { type: "START" },
  { type: "NEXT" },
  { type: "BACK" },
  { type: "DISMISS" },
);

describe("Property 5: Replay always restarts at step 1", () => {
  /** **Validates: Requirements 12.2, 15.5** */
  it("START after any action sequence yields {visible: true, step: 1}", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 50 }), (actions) => {
        const before: TourState = actions.reduce(tourReducer, INITIAL_TOUR_STATE);
        const after = tourReducer(before, { type: "START" });
        expect(after).toEqual({ visible: true, step: 1 });
      }),
      { numRuns: 200 },
    );
  });
});
