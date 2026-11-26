/**
 * Property-based tests for the shared building scale.
 *
 * Footprint and height stay within fixed bounds and never shrink as complexity grows.
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_BUILDING_HEIGHT,
  MAX_FOOTPRINT_RADIUS,
  MIN_BUILDING_HEIGHT,
  MIN_FOOTPRINT_RADIUS,
  buildingHeight,
  buildingWidth,
  footprintRadius,
} from "../buildingScale.ts";
// --- Arbitraries ---
const complexityArb = fc.oneof(fc.integer({ min: 0, max: 10_000 }), fc.double({ min: -5, max: 1e9, noNaN: true }));
// --- Properties ---
describe("building scale", () => {
  it("keeps footprint, width and height within bounds", () => {
    fc.assert(
      fc.property(complexityArb, (c) => {
        const r = footprintRadius(c);
        const h = buildingHeight(c);
        expect(r).toBeGreaterThanOrEqual(MIN_FOOTPRINT_RADIUS);
        expect(r).toBeLessThanOrEqual(MAX_FOOTPRINT_RADIUS);
        expect(h).toBeGreaterThanOrEqual(MIN_BUILDING_HEIGHT);
        expect(h).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT);
        expect(buildingWidth(c)).toBeLessThan(2 * r);
      }),
      { numRuns: 200 }
    );
  });
  it("never decreases as complexity grows", () => {
    fc.assert(
      fc.property(complexityArb, complexityArb, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(footprintRadius(hi)).toBeGreaterThanOrEqual(footprintRadius(lo));
        expect(buildingHeight(hi)).toBeGreaterThanOrEqual(buildingHeight(lo));
        expect(buildingWidth(hi)).toBeGreaterThanOrEqual(buildingWidth(lo));
      }),
      { numRuns: 200 }
    );
  });
  it("grows strictly while below the cap, so tall buildings stay the most prominent", () => {
    expect(buildingHeight(20)).toBeGreaterThan(buildingHeight(10));
    expect(buildingHeight(10)).toBeGreaterThan(buildingHeight(1));
    expect(buildingHeight(1000)).toBeLessThanOrEqual(MAX_BUILDING_HEIGHT);
  });
});
