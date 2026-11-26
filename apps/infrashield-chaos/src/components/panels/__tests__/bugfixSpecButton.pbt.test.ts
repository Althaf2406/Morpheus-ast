/**
 * Property-based tests for BugfixSpecButton pure helpers.
 *
 * **Validates: Requirements REQ-IS-012 (TASK-IS-12)**
 *
 * One property under test:
 *   P1 — blastLabel always returns a valid non-empty label

 */

import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { blastLabel } from "../BugfixSpecButton.tsx";
import { scoreArb } from "./bugfixSpecArbitraries.ts";
// ─── P1 — blastLabel correctness ─────────────────────────────────────────────

describe("P1 — blastLabel", () => {
  /**
   * **Validates: Requirements REQ-IS-012**
   *
   * For any score in [0, 1], blastLabel returns a non-empty string containing
   * a percentage between 0 and 100 and one of the three severity words.
   */
  it("always returns a non-empty string", () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        expect(blastLabel(score).length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it("contains a valid integer percentage", () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        const label = blastLabel(score);
        const match = /^(\d+)%/.exec(label);
        expect(match).not.toBeNull();
        const pct = parseInt(match![1], 10);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300 },
    );
  });

  it("contains exactly one of (high|medium|low)", () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        const label = blastLabel(score);
        expect(label).toMatch(/\((high|medium|low)\)$/);
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic for identical inputs", () => {
    fc.assert(
      fc.property(scoreArb, (score) => {
        expect(blastLabel(score)).toBe(blastLabel(score));
      }),
      { numRuns: 200 },
    );
  });

  it("produces 'high' label for scores >= 0.7", () => {
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0.7), max: Math.fround(1), noNaN: true }), (score) => {
        expect(blastLabel(score)).toMatch(/\(high\)$/);
      }),
      { numRuns: 200 },
    );
  });

  it("produces 'low' label for scores < 0.3", () => {
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0), max: Math.fround(0.294), noNaN: true }), (score) => {
        expect(blastLabel(score)).toMatch(/\(low\)$/);
      }),
      { numRuns: 200 },
    );
  });
});

