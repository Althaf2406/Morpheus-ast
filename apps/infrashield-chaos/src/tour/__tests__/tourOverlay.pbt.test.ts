// @vitest-environment jsdom
/**
 * Property 4: Spotlight/Centered_Card choice.
 * **Validates: Requirements 9.6, 9.7**
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, it, expect } from "vitest";
import fc from "fast-check";
import { TourOverlay } from "../TourOverlay";
import { TOUR_STEPS } from "../tourSteps";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Presence = "absent" | "onScreen" | "offScreen";

const noop = (): void => undefined;

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top, left, width, height, bottom: top + height, right: left + width, x: left, y: top,
    toJSON: () => ({}),
  };
}

const rectArb = fc.record({
  top: fc.integer({ min: 0, max: 300 }),
  left: fc.integer({ min: 0, max: 400 }),
  width: fc.integer({ min: 1, max: 300 }),
  height: fc.integer({ min: 1, max: 300 }),
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TourOverlay Property 4: Spotlight vs Centered_Card", () => {
  it("renders Spotlight iff target is present and on screen", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<1 | 2 | 3>(1, 2, 3),
        fc.constantFrom<Presence>("absent", "onScreen", "offScreen"),
        rectArb,
        (step, presence, r) => {
          const selector = TOUR_STEPS[step - 1].targetSelector;
          if (presence !== "absent") {
            const target = document.createElement("div");
            const name = /data-tour="([^"]+)"/.exec(selector)?.[1] ?? "";
            target.setAttribute("data-tour", name);
            target.getBoundingClientRect = () =>
              presence === "onScreen"
                ? rect(r.top, r.left, r.width, r.height)
                : rect(-500, -500, r.width, r.height);
            document.body.appendChild(target);
          }
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
            const spotlight = document.querySelector('[data-testid="tour-spotlight"]');
            const card = document.querySelector('[role="dialog"]');
            expect(card).not.toBeNull();
            const centered = card?.classList.contains("tour-card-centered") ?? false;
            if (presence === "onScreen") {
              expect(spotlight).not.toBeNull();
              expect(centered).toBe(false);
            } else {
              expect(spotlight).toBeNull();
              expect(centered).toBe(true);
            }
          } finally {
            act(() => root.unmount());
            document.body.innerHTML = "";
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
