/**
 * Unit tests for the tour reducer transitions.
 * Validates: Requirements 9.5, 15.3, 15.4
 */
import { describe, expect, it } from "vitest";
import { INITIAL_TOUR_STATE, tourReducer, type TourState } from "../tourState";

// --- Fixtures ---
const hiddenAt = (step: 1 | 2 | 3): TourState => ({ visible: false, step });
const shownAt = (step: 1 | 2 | 3): TourState => ({ visible: true, step });

describe("tourReducer", () => {
  it("starts hidden at step 1", () => {
    expect(INITIAL_TOUR_STATE).toEqual({ visible: false, step: 1 });
  });

  it("START shows the tour at step 1", () => {
    expect(tourReducer(INITIAL_TOUR_STATE, { type: "START" })).toEqual(shownAt(1));
    expect(tourReducer(shownAt(3), { type: "START" })).toEqual(shownAt(1));
  });

  it("NEXT advances 1 -> 2 -> 3", () => {
    expect(tourReducer(shownAt(1), { type: "NEXT" })).toEqual(shownAt(2));
    expect(tourReducer(shownAt(2), { type: "NEXT" })).toEqual(shownAt(3));
  });

  it("NEXT at the last step dismisses the tour", () => {
    expect(tourReducer(shownAt(3), { type: "NEXT" })).toEqual(hiddenAt(1));
  });

  it("BACK goes 3 -> 2 -> 1", () => {
    expect(tourReducer(shownAt(3), { type: "BACK" })).toEqual(shownAt(2));
    expect(tourReducer(shownAt(2), { type: "BACK" })).toEqual(shownAt(1));
  });

  it("BACK at step 1 stays at step 1", () => {
    expect(tourReducer(shownAt(1), { type: "BACK" })).toEqual(shownAt(1));
  });

  it("DISMISS hides the tour from any step", () => {
    for (const step of [1, 2, 3] as const) {
      expect(tourReducer(shownAt(step), { type: "DISMISS" })).toEqual(hiddenAt(1));
    }
  });

  it("NEXT and BACK are no-ops when hidden", () => {
    const state = hiddenAt(2);
    expect(tourReducer(state, { type: "NEXT" })).toBe(state);
    expect(tourReducer(state, { type: "BACK" })).toBe(state);
  });
});
