/**
 * Property 12: Torch flicker stays within bounds when motion is not reduced.
 * **Validates: Requirements 2.10, 2.11**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { flickerFactor } from "../torchAllocation.ts";

// --- Generators ---
const timeArb = fc.double({ min: 0, max: 100_000, noNaN: true });
const seedArb = fc.double({ min: 0, max: 1, noNaN: true });
const EPSILON = 1e-6;

describe("Property 12: torch flicker bounds", () => {
  it("stays within [0.75, 1.25] for any time and seed", () => {
    fc.assert(
      fc.property(timeArb, seedArb, (time, seed) => {
        const factor = flickerFactor(time, seed, false);
        expect(factor).toBeGreaterThanOrEqual(0.75 - EPSILON);
        expect(factor).toBeLessThanOrEqual(1.25 + EPSILON);
      }),
    );
  });

  it("repeats with a period of at least 2 seconds", () => {
    fc.assert(
      fc.property(timeArb, seedArb, (time, seed) => {
        const period = Math.max(2, 2.4 + 0.8 * seed);
        expect(period).toBeGreaterThanOrEqual(2);
        const a = flickerFactor(time, seed, false);
        const b = flickerFactor(time + period, seed, false);
        expect(Math.abs(a - b)).toBeLessThan(1e-6);
      }),
    );
  });

  it("reaches both extremes half a period apart for seed 0", () => {
    const peakTime = 0.6;
    expect(flickerFactor(peakTime, 0, false)).toBeCloseTo(1.25, 6);
    expect(flickerFactor(peakTime + 1.2, 0, false)).toBeCloseTo(0.75, 6);
  });

  it("is exactly 1 under Reduced_Motion", () => {
    fc.assert(
      fc.property(timeArb, seedArb, (time, seed) => {
        expect(flickerFactor(time, seed, true)).toBe(1);
      }),
    );
  });
});
