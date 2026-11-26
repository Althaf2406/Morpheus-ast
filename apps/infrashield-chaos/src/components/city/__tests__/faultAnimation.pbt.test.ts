/**
 * Property-based tests for the fault animation system.
 *
 * **Validates: Requirements REQ-IS-003, REQ-IS-004, REQ-IS-005, REQ-IS-006**
 *
 * One property under test:
 *   P1 — Cascade order completeness
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { buildFaultAnimation, CASCADE_STAGGER_S } from "../useFaultAnimation.ts";
import { layoutArb, makeScene } from "./faultLayoutArb.ts";
// ─── P1 — Cascade order completeness ─────────────────────────────────────────

describe("P1 — Cascade order completeness", () => {
  /**
   * **Validates: Requirements REQ-IS-003, REQ-IS-006**
   *
   * For any layout with N affected nodes, after driving the animation tick far
   * enough past the last cascade stagger step, exactly those N affected nodes
   * (and no healthy nodes) are lit amber.
   */
  it("eventually reveals exactly the affected nodes and no healthy ones", () => {
    fc.assert(
      fc.property(layoutArb, ({ nodes, edges, positions }) => {
        const scene  = makeScene();
        const handle = buildFaultAnimation({
          nodes, edges, positions, scene, reducedMotion: false,
        });

        const affectedIds = new Set(nodes.filter((n) => n.isAffected).map((n) => n.id));
        const N           = affectedIds.size;

        // Drive time past the last stagger step + 0.5s safety margin
        const tEnd = N * CASCADE_STAGGER_S + 0.5;

        // Simulate ticks from t=0 to tEnd in 50ms steps
        for (let t = 0; t <= tEnd; t += 0.05) {
          handle.animateTick(t);
        }

        const revealed = handle.revealedAffectedIds();

        // All affected nodes must be revealed
        for (const id of affectedIds) {
          expect(revealed.has(id), `affected node ${id} not revealed`).toBe(true);
        }

        // No healthy nodes should be in the revealed set
        const healthyIds = new Set(
          nodes.filter((n) => !n.isAffected && !n.isFaulted).map((n) => n.id)
        );
        for (const id of healthyIds) {
          expect(revealed.has(id), `healthy node ${id} wrongly revealed`).toBe(false);
        }

        handle.dispose();
      }),
      { numRuns: 50 }
    );
  });
});

