import { describe, expect, it } from "vitest";
import { INITIAL_TOUR_STATE, tourReducer, type TourState } from "../tourState";

const at = (step: 1 | 2 | 3): TourState => ({ visible: true, step });

describe("tourReducer", () => {
  it("starts hidden at step 1", () => {
    expect(INITIAL_TOUR_STATE).toEqual({ visible: false, step: 1 });
  });

  it("START shows the tour at step 1", () => {
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "START" })).toEqual(at(1));
  });

  it("NEXT advances 1 -> 2 -> 3", () => {
    expect(tourReducer(at(1), { type: "NEXT" })).toEqual(at(2));
    expect(tourReducer(at(2), { type: "NEXT" })).toEqual(at(3));
  });

  it("NEXT at the last step dismisses the tour", () => {
    expect(tourReducer(at(3), { type: "NEXT" })).toEqual({ visible: false, step: 1 });
  });

  it("BACK goes 3 -> 2 -> 1", () => {
    expect(tourReducer(at(3), { type: "BACK" })).toEqual(at(2));
    expect(tourReducer(at(2), { type: "BACK" })).toEqual(at(1));
  });

  it("BACK at step 1 stays at step 1", () => {
    expect(tourReducer(at(1), { type: "BACK" })).toEqual(at(1));
  });

  it("DISMISS hides the tour from any step", () => {
    for (const step of [1, 2, 3] as const) {
      expect(tourReducer(at(step), { type: "DISMISS" })).toEqual({ visible: false, step: 1 });
    }
  });

  it("NEXT and BACK are no-ops when hidden", () => {
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "NEXT" })).toBe(INITIAL_TOUR_STATE);
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "BACK" })).toBe(INITIAL_TOUR_STATE);
  });
});
