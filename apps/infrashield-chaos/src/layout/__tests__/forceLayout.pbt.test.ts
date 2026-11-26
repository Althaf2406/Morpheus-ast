/**
 * Property-based tests for the Layout_Solver (computeCityForceLayout).
 *
 * Properties 1-4 of infrashield-real-engine-integration.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeCityForceLayout } from "../forceLayout.ts";
import type { CityEdge, CityNode } from "../../adapter.ts";
import { footprintRadius } from "../buildingScale.ts";

// --- Helpers ---

const radius = (node: CityNode): number => footprintRadius(node.complexity);

// --- Arbitraries ---

const complexityArb = fc.integer({ min: 0, max: 20 });

function layoutArb(minNodes: number, maxNodes: number): fc.Arbitrary<{ nodes: CityNode[]; edges: CityEdge[] }> {
  return fc
    .array(complexityArb, { minLength: minNodes, maxLength: maxNodes })
    .chain((complexities) => {
      const nodes: CityNode[] = complexities.map((complexity, i) => ({
        id: `n${i}`,
        name: `fn${i}`,
        filePath: `src/f${i}.ts`,
        complexity,
        isFaulted: false,
        isAffected: false,
        centralityScore: 0,
      }));
      const n = nodes.length;
      const edgeArb: fc.Arbitrary<CityEdge[]> =
        n === 0
          ? fc.constant([])
          : fc
              .array(fc.tuple(fc.nat({ max: n - 1 }), fc.nat({ max: n - 1 })), { maxLength: n * 2 })
              .map((pairs) =>
                pairs.map(([s, t], i) => ({
                  id: `e${i}`,
                  sourceId: `n${s}`,
                  targetId: `n${t}`,
                  isCyclic: false,
                  isCascading: false,
                })),
              );
      return edgeArb.map((edges) => ({ nodes, edges }));
    });
}

const anyLayoutArb = layoutArb(0, 25);
const largeLayoutArb = layoutArb(10, 25);

// --- Properties ---

describe("computeCityForceLayout", () => {
  it("Property 1: every node receives a finite, flat-plane position", () => {
    // **Validates: Requirements 2.1, 2.2, 2.7, 2.11**
    expect(computeCityForceLayout([], []).positions.size).toBe(0);

    fc.assert(
      fc.property(anyLayoutArb, ({ nodes, edges }) => {
        const { positions } = computeCityForceLayout(nodes, edges);
        expect(positions.size).toBe(nodes.length);
        for (const node of nodes) {
          const p = positions.get(node.id);
          expect(p).toBeDefined();
          if (p === undefined) continue;
          expect(p.y).toBe(0);
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
          expect(Number.isFinite(p.z)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Property 2: identical inputs produce identical positions", () => {
    // **Validates: Requirements 2.5, 2.6, 2.11**
    fc.assert(
      fc.property(anyLayoutArb, ({ nodes, edges }) => {
        const first = computeCityForceLayout(nodes, edges).positions;
        const second = computeCityForceLayout(
          nodes.map((n) => ({ ...n })),
          edges.map((e) => ({ ...e })),
        ).positions;
        expect(second.size).toBe(first.size);
        for (const [id, p] of first) {
          const q = second.get(id);
          expect(q).toBeDefined();
          expect(q?.x).toBe(p.x);
          expect(q?.y).toBe(p.y);
          expect(q?.z).toBe(p.z);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Property 3: no two building footprints overlap", () => {
    // **Validates: Requirements 2.8, 2.11**
    fc.assert(
      fc.property(layoutArb(0, 25), ({ nodes, edges }) => {
        const { positions } = computeCityForceLayout(nodes, edges);
        for (let a = 0; a < nodes.length; a++) {
          for (let b = a + 1; b < nodes.length; b++) {
            const pa = positions.get(nodes[a].id);
            const pb = positions.get(nodes[b].id);
            expect(pa).toBeDefined();
            expect(pb).toBeDefined();
            if (pa === undefined || pb === undefined) continue;
            const dist = Math.hypot(pa.x - pb.x, pa.z - pb.z);
            expect(dist).toBeGreaterThanOrEqual(radius(nodes[a]) + radius(nodes[b]) - 1e-9);
          }
        }
      }),
      { numRuns: 50 },
    );
  });

  it("Property 4: total footprint is at most 4x the sum of building footprint areas", () => {
    // **Validates: Requirements 2.9, 2.11**
    fc.assert(
      fc.property(largeLayoutArb, ({ nodes, edges }) => {
        const { positions } = computeCityForceLayout(nodes, edges);
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        let buildingArea = 0;
        for (const node of nodes) {
          const p = positions.get(node.id);
          if (p === undefined) throw new Error(`missing position for ${node.id}`);
          const r = radius(node);
          minX = Math.min(minX, p.x - r);
          maxX = Math.max(maxX, p.x + r);
          minZ = Math.min(minZ, p.z - r);
          maxZ = Math.max(maxZ, p.z + r);
          buildingArea += (2 * r) * (2 * r);
        }
        const layoutArea = (maxX - minX) * (maxZ - minZ);
        expect(layoutArea).toBeLessThanOrEqual(4 * buildingArea);
      }),
      { numRuns: 50 },
    );
  });
});
