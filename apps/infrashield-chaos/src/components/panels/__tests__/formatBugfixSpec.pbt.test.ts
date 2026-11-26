/**
 * Property-based tests for formatBugfixSpec.
 *
 * **Validates: Requirements REQ-IS-012 (TASK-IS-12)**
 *
 *   P2 — formatBugfixSpec output contains every required header field
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { formatBugfixSpec } from "../BugfixSpecButton.tsx";
import { bugfixSpecArb } from "./bugfixSpecArbitraries.ts";

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
