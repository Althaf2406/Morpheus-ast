/**
 * Property-based test for linear pillar scaling.
 *
 * **Feature: necro-visual-polish, Property 3: Pillar dimensions scale linearly with wall height**
 * **Validates: Requirements 1.5**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { scaleFor } from "../scale.ts";

const wallHeightArb = fc.double({ min: 0.01, max: 1000, noNaN: true });
const RELATIVE_TOLERANCE = 1e-9;

describe("pillar scaling", () => {
  it("P3: pillar dimensions for h2 equal those for h1 multiplied by h2 / h1", () => {
    fc.assert(
      fc.property(wallHeightArb, wallHeightArb, (h1, h2) => {
        const base = scaleFor(h1);
        const scaled = scaleFor(h2);
        const ratio = h2 / h1;
        expect(scaled.pillarHeight).toBeCloseTo(base.pillarHeight * ratio, 9);
        expect(scaled.pillarGirth).toBeCloseTo(base.pillarGirth * ratio, 9);
        expect(Math.abs(scaled.pillarHeight - base.pillarHeight * ratio)).toBeLessThanOrEqual(
          RELATIVE_TOLERANCE * Math.max(1, scaled.pillarHeight),
        );
      }),
      { numRuns: 200 },
    );
  });
});
