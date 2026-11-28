// @vitest-environment jsdom
/**
 * Property 3: the step indicator reads "n / 3" for the current step and the total is always 3.
 *
 * **Validates: Requirements 9.2, 9.3**
 */
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { TourOverlay } from "../TourOverlay";
import type { TourState } from "../tourState";
import { TOUR_STEPS } from "../tourSteps";

describe("Property 3: step indicator", () => {
  afterEach(cleanup);

  it("shows `${step} / 3` for any step and the tour always has 3 steps", () => {
    fc.assert(
      fc.property(fc.constantFrom<1 | 2 | 3>(1, 2, 3), (step) => {
        const state: TourState = { visible: true, step };
        const noop = (): void => undefined;
        const { unmount } = render(
          createElement(TourOverlay, { state, onNext: noop, onBack: noop, onSkip: noop }),
        );
        const indicator = document.body.querySelector(".tour-card__step");
        const text = indicator?.textContent ?? null;
        unmount();
        expect(text).toBe(`${step} / 3`);
        expect(TOUR_STEPS.length).toBe(3);
      }),
      { numRuns: 100 },
    );
  });
});
