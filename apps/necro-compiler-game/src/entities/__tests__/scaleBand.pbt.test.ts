/**
 * **Feature: necro-visual-polish, Property 1: Regular monster height stays within the mandated band**
 *
 * **Validates: Requirements 1.3**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { scaleFor } from "../scale.ts";

const BAND_MIN = 0.3;
const BAND_MAX = 0.4;
const EPSILON = 1e-9;

const wallHeightArb = fc.double({ min: 1e-3, max: 1e4, noNaN: true });

describe("scale regular monster band", () => {
  it("P1: regular monster height is 30%..40% of Wall_Height", () => {
    fc.assert(
      fc.property(wallHeightArb, (wallHeight) => {
        const height = scaleFor(wallHeight).regularMonsterHeight;
        expect(height).toBeGreaterThanOrEqual(wallHeight * BAND_MIN - EPSILON * wallHeight);
        expect(height).toBeLessThanOrEqual(wallHeight * BAND_MAX + EPSILON * wallHeight);
      }),
      { numRuns: 200 },
    );
  });
});
