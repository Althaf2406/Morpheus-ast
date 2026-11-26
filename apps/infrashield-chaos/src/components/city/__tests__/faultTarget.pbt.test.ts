/**
 * Property 6: Default fault target is the highest-centrality node.
 *
 * **Validates: Requirements 4.4**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CityNode } from "../../../adapter";
import { highestCentralityId } from "../faultTarget";

// --- Generators ---
const nodeArb = (index: number): fc.Arbitrary<CityNode> =>
  fc.integer({ min: 0, max: 5 }).map((score) => ({
    id: `n${index}`,
    name: `fn${index}`,
    filePath: "src/a.ts",
    complexity: 1,
    isFaulted: false,
    isAffected: false,
    centralityScore: score / 5,
  }));

const nodesArb: fc.Arbitrary<readonly CityNode[]> = fc
  .integer({ min: 1, max: 20 })
  .chain((length) => fc.tuple(...Array.from({ length }, (_, i) => nodeArb(i))));

describe("Property 6: highestCentralityId", () => {
  it("returns the first node holding the maximum centralityScore", () => {
    fc.assert(
      fc.property(nodesArb, (nodes) => {
        const max = Math.max(...nodes.map((n) => n.centralityScore));
        const expected = nodes.find((n) => n.centralityScore === max);
        expect(highestCentralityId(nodes)).toBe(expected?.id);
      }),
      { numRuns: 100 },
    );
  });

  it("returns null for an empty array", () => {
    expect(highestCentralityId([])).toBeNull();
  });
});
