// @vitest-environment jsdom
/**
 * Property 4: Spotlight vs Centered_Card choice.
 *
 * **Validates: Requirements 9.6, 9.7**
 */
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { TourOverlay } from "../TourOverlay";
import { TOUR_STEPS } from "../tourSteps";

type Presence = "absent" | "onscreen" | "offscreen" | "empty";

const noop = (): void => undefined;

function rectOf(p: Presence): DOMRect {
  const box = (top: number, left: number, width: number, height: number): DOMRect =>
    ({
      top, left, width, height,
      bottom: top + height, right: left + width,
      x: left, y: top, toJSON: () => ({}),
    }) as DOMRect;
  if (p === "onscreen") return box(100, 100, 200, 50);
  if (p === "offscreen") return box(-500, -500, 100, 40);
  return box(100, 100, 0, 0);
}

function mountTarget(selector: string, p: Presence): HTMLElement | null {
  if (p === "absent") return null;
  const el = document.createElement("div");
  const m = /\[data-tour="([^"]+)"\]/.exec(selector);
  el.setAttribute("data-tour", m?.[1] ?? "");
  el.getBoundingClientRect = (): DOMRect => rectOf(p);
  document.body.appendChild(el);
  return el;
}

describe("Property 4: Spotlight/Centered_Card choice", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders the spotlight iff the target is present and on screen", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<1 | 2 | 3>(1, 2, 3),
        fc.constantFrom<Presence>("absent", "onscreen", "offscreen", "empty"),
        (step, presence) => {
          const target = mountTarget(TOUR_STEPS[step - 1].targetSelector, presence);
          const { unmount } = render(
            createElement(TourOverlay, { state: { visible: true, step }, onNext: noop, onBack: noop, onSkip: noop }),
          );
          try {
            const spotlight = document.querySelector('[data-testid="tour-spotlight"]');
            const card = document.querySelector('[role="dialog"]');
            expect(card).not.toBeNull();
            expect(card?.textContent).toContain(`${step} / 3`);
            if (presence === "onscreen") {
              expect(spotlight).not.toBeNull();
              expect(card?.classList.contains("tour-card--centered")).toBe(false);
            } else {
              expect(spotlight).toBeNull();
              expect(card?.classList.contains("tour-card--centered")).toBe(true);
            }
          } finally {
            unmount();
            target?.remove();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
