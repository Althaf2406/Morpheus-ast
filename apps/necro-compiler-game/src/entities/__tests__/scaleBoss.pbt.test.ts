/**
 * Property-based test for the boss versus regular monster height.
 *
 * **Feature: necro-visual-polish, Property 2: Boss monster is always taller than a regular monster at the same wall height**
 * **Validates: Requirements 1.4**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { scaleFor } from "../scale.ts";

// --- Property ---

describe("Property 2: boss monster is taller than a regular monster", () => {
  it("bossMonsterHeight > regularMonsterHeight for any positive wall height", () => {
    fc.assert(
      fc.property(fc.double({ min: 1e-6, max: 1e6, noNaN: true }), (wallHeight) => {
        const result = scaleFor(wallHeight);
        expect(result.bossMonsterHeight).toBeGreaterThan(result.regularMonsterHeight);
      }),
      { numRuns: 100 },
    );
  });
});
