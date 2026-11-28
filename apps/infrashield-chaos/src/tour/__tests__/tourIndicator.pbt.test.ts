// @vitest-environment jsdom
/**
 * Property 3: Step indicator matches the current step.
 * **Validates: Requirements 9.2, 9.3**
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, it, expect } from "vitest";
import fc from "fast-check";
import { TourOverlay } from "../TourOverlay";
import { TOUR_STEPS } from "../tourSteps";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = (): void => undefined;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TourOverlay Property 3: step indicator", () => {
  it("shows `${step} / 3` for any step and the tour has exactly 3 steps", () => {
    fc.assert(
      fc.property(fc.constantFrom<1 | 2 | 3>(1, 2, 3), (step) => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        try {
          act(() => {
            root.render(
              createElement(TourOverlay, {
                state: { visible: true, step },
                onNext: noop,
                onBack: noop,
                onSkip: noop,
              }),
            );
          });
          const indicator = document.querySelector(".tour-indicator");
          expect(indicator).not.toBeNull();
          expect(indicator?.textContent).toBe(`${step} / 3`);
          expect(TOUR_STEPS.length).toBe(3);
        } finally {
          act(() => root.unmount());
          document.body.innerHTML = "";
        }
      }),
      { numRuns: 100 },
    );
  });
});
