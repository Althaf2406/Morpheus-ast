/**
 * Property-based tests for BugfixSpecButton pure helpers.
 *
 * **Validates: Requirements REQ-IS-012 (TASK-IS-12)**
 *
 * Two properties under test:
 *   P1 — blastLabel always returns a valid non-empty label
 *   P2 — formatBugfixSpec output contains every required header field
 */

import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { blastLabel, formatBugfixSpec } from "../BugfixSpecButton.tsx";
import type { InfraShieldAdapter } from "../../../adapter.ts";

// Derive BugfixSpec from the adapter — no direct core import needed.
type BugfixSpec = ReturnType<InfraShieldAdapter["generateBugfixSpec"]>;

// ─── Shared arbitraries ────────────────────────────────────────────────────────

const scoreArb = fc.float({ min: 0, max: 1, noNaN: true });

const faultTypeArb = fc.constantFrom<BugfixSpec["faultType"]>(
  "LATENCY",
  "NETWORK_FAILURE",
  "EXTREME_PAYLOAD",
  "UNCAUGHT_EXCEPTION",
);

const spliceArb = fc.record({
  filePath:    fc.string({ minLength: 1 }),
  startIndex:  fc.nat(),
  endIndex:    fc.nat(),
  replacement: fc.string(),
  description: fc.string({ minLength: 1 }),
});

const bugfixSpecArb: fc.Arbitrary<BugfixSpec> = fc.record({
  specId:              fc.string({ minLength: 1 }),
  title:               fc.string({ minLength: 1 }),
  targetFunctionId:    fc.string({ minLength: 1 }),
  filePath:            fc.string({ minLength: 1 }),
  currentBehavior:     fc.string(),
  expectedBehavior:    fc.string(),
  unchangedBehavior:   fc.string(),
  fixProperty:         fc.string(),
  preservationProperty:fc.string(),
  suggestedMutation:   fc.record({
    splices: fc.array(spliceArb, { maxLength: 8 }),
  }),
  faultType:           faultTypeArb,
  blastRadiusScore:    scoreArb,
  createdAt:           fc.integer({ min: 0 }),
});

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

// ─── P2 — formatBugfixSpec output integrity ──────────────────────────────────

describe("P2 — formatBugfixSpec output", () => {
  /**
   * **Validates: Requirements REQ-IS-012**
   *
   * For any valid BugfixSpec, formatBugfixSpec returns a non-empty string that
   * contains all required section headers and key identifiers.
   */
  it("always returns a non-empty string", () => {
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        expect(formatBugfixSpec(spec).length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("contains all required section headers", () => {
    const HEADERS = [
      "## Current Behavior",
      "## Expected Behavior",
      "## Unchanged Behavior",
      "## Fix Property",
      "## Preservation Property",
      "## Suggested Splices",
    ];
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        const out = formatBugfixSpec(spec);
        for (const h of HEADERS) {
          expect(out).toContain(h);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("embeds the specId in the output", () => {
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        expect(formatBugfixSpec(spec)).toContain(spec.specId);
      }),
      { numRuns: 200 },
    );
  });

  it("embeds the targetFunctionId in the output", () => {
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        expect(formatBugfixSpec(spec)).toContain(spec.targetFunctionId);
      }),
      { numRuns: 200 },
    );
  });

  it("embeds the faultType in the output", () => {
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        expect(formatBugfixSpec(spec)).toContain(spec.faultType);
      }),
      { numRuns: 200 },
    );
  });

  it("reports the correct splice count in the header", () => {
    fc.assert(
      fc.property(bugfixSpecArb, (spec) => {
        const out   = formatBugfixSpec(spec);
        const count = spec.suggestedMutation.splices.length;
        expect(out).toContain(`## Suggested Splices (${count})`);
      }),
      { numRuns: 200 },
    );
  });
});
