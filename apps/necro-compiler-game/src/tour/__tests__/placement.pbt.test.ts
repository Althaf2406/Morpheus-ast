/**
 * Card placement is always fully inside the viewport (16px margin), for any target and viewport.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CARD_MARGIN, placeCard } from "../placement";

const rectArb = fc.record({
  top: fc.integer({ min: -2000, max: 4000 }),
  left: fc.integer({ min: -2000, max: 4000 }),
  width: fc.integer({ min: 1, max: 4000 }),
  height: fc.integer({ min: 1, max: 4000 }),
});
const viewportArb = fc.record({
  width: fc.integer({ min: 320, max: 3000 }),
  height: fc.integer({ min: 320, max: 2000 }),
});
const cardArb = fc.record({
  width: fc.integer({ min: 100, max: 600 }),
  height: fc.integer({ min: 80, max: 900 }),
});

describe("placeCard", () => {
  it("keeps the card inside the viewport with a 16px margin", () => {
    fc.assert(
      fc.property(fc.option(rectArb, { nil: null }), viewportArb, cardArb, (target, vp, card) => {
        const p = placeCard(target, vp, card);
        expect(p.left).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(p.top).toBeGreaterThanOrEqual(CARD_MARGIN);
        expect(p.left + p.width).toBeLessThanOrEqual(vp.width - CARD_MARGIN);
        expect(p.top + p.height).toBeLessThanOrEqual(vp.height - CARD_MARGIN);
      }),
      { numRuns: 500 },
    );
  });

  it("centers the card for a full-screen target", () => {
    const p = placeCard({ top: 0, left: 0, width: 1440, height: 900 }, { width: 1440, height: 900 }, { width: 340, height: 160 });
    expect(p.centered).toBe(true);
    expect(p.left).toBe(550);
    expect(p.top).toBe(370);
  });

  it("anchors below a small target when there is room", () => {
    const p = placeCard({ top: 100, left: 100, width: 200, height: 50 }, { width: 1440, height: 900 }, { width: 340, height: 160 });
    expect(p.centered).toBe(false);
    expect(p.top).toBe(162);
  });
});
