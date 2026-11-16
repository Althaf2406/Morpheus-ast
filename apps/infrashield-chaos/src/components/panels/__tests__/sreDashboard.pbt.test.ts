/**
 * Property-based tests for SRE Dashboard panel helpers.
 *
 * **Validates: Requirements REQ-IS-009**
 *
 * Two properties under test:
 *   P1 — Blast radius score clamped display
 *   P2 — Security findings badge color
 */

import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { scoreToPercent }  from "../BlastRadiusCard.tsx";
import { severityColor }   from "../SecurityFindingsCard.tsx";

// ─── P1 — Blast radius score clamped display ──────────────────────────────────

describe("P1 — Blast radius score clamped display", () => {
  /**
   * **Validates: Requirements REQ-IS-009**
   *
   * For any blastRadiusScore in [0, 1], scoreToPercent returns
   * Math.round(score * 100) clamped to [0, 100].
   */
  it("scoreToPercent returns a value in [0, 100] for any score in [0, 1]", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        (score) => {
          const pct = scoreToPercent(score);
          expect(pct).toBeGreaterThanOrEqual(0);
          expect(pct).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("scoreToPercent equals Math.round(score * 100) for in-range inputs", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        (score) => {
          const expected = Math.min(100, Math.max(0, Math.round(score * 100)));
          expect(scoreToPercent(score)).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── P2 — Security findings badge color ──────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ff4444",
  HIGH:     "#ff8800",
  MEDIUM:   "#ffcc00",
  LOW:      "#44aaff",
};

const VALID_COLORS = new Set(Object.values(SEVERITY_COLORS));

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const severityArb = fc.constantFrom<Severity>("CRITICAL", "HIGH", "MEDIUM", "LOW");

describe("P2 — Security findings badge color", () => {
  /**
   * **Validates: Requirements REQ-IS-009**
   *
   * For any severity from the four valid values, severityColor returns one of
   * the four designated hex colors and is consistent across repeated calls.
   */
  it("returns one of the four designated hex colors", () => {
    fc.assert(
      fc.property(severityArb, (severity) => {
        const color = severityColor(severity);
        expect(VALID_COLORS.has(color)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("is deterministic — same severity always produces the same color", () => {
    fc.assert(
      fc.property(severityArb, (severity) => {
        expect(severityColor(severity)).toBe(severityColor(severity));
      }),
      { numRuns: 100 },
    );
  });

  it("produces the exact expected hex for each severity", () => {
    fc.assert(
      fc.property(severityArb, (severity) => {
        expect(severityColor(severity)).toBe(SEVERITY_COLORS[severity]);
      }),
      { numRuns: 100 },
    );
  });
});
