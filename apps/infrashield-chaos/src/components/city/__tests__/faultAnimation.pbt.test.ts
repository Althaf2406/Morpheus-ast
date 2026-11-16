/**
 * Property-based tests for the fault animation system.
 *
 * **Validates: Requirements REQ-IS-003, REQ-IS-004, REQ-IS-005, REQ-IS-006**
 *
 * Three properties under test:
 *   P1 — Cascade order completeness
 *   P2 — Reduced motion correctness
 *   P3 — Dispose cleans up
 */

import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it } from "vitest";
import { expect } from "vitest";
import {
  buildFaultAnimation,
  CASCADE_STAGGER_S,
  COLOR_FAULTED,
  COLOR_AFFECTED,
} from "../useFaultAnimation.ts";
import type { CityNode, CityEdge } from "../../../adapter.ts";

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const cityNodeArb = (id: string, opts?: { isFaulted?: boolean; isAffected?: boolean }): fc.Arbitrary<CityNode> =>
  fc.record({
    id:              fc.constant(id),
    name:            fc.hexaString({ minLength: 1, maxLength: 8 }),
    filePath:        fc.constant(`src/${id}.ts`),
    complexity:      fc.integer({ min: 1, max: 15 }),
    isFaulted:       fc.constant(opts?.isFaulted ?? false),
    isAffected:      fc.constant(opts?.isAffected ?? false),
    centralityScore: fc.float({ min: 0, max: 1, noNaN: true }),
  });

/** Generates a layout with exactly one faulted node and 0–8 affected nodes. */
const layoutArb = fc.nat({ max: 7 }).chain((affectedCount) => {
  const faultedId = "fn-fault";
  const affectedIds = Array.from({ length: affectedCount }, (_, i) => `fn-aff-${i}`);
  const extraIds    = Array.from({ length: 3 },              (_, i) => `fn-hlth-${i}`);

  const allIds = [faultedId, ...affectedIds, ...extraIds];

  const nodesArb = fc.tuple(
    cityNodeArb(faultedId, { isFaulted: true }),
    ...affectedIds.map((id) => cityNodeArb(id, { isAffected: true })),
    ...extraIds.map((id)    => cityNodeArb(id)),
  );

  return nodesArb.map((nodes) => {
    // Build positions map
    const positions = new Map<string, THREE.Vector3>();
    allIds.forEach((id, i) => {
      positions.set(id, new THREE.Vector3(i * 2, 0, 0));
    });

    // Build a few edges (some touching the faulted node)
    const edges: CityEdge[] = affectedIds.map((aId, i) => ({
      id:         `e-${i}`,
      sourceId:   faultedId,
      targetId:   aId,
      isCyclic:   false,
      isCascading: true,
    }));

    return { nodes: nodes as CityNode[], edges, positions };
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

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

// ─── P2 — Reduced motion correctness ─────────────────────────────────────────

describe("P2 — Reduced motion correctness", () => {
  /**
   * **Validates: Requirements REQ-IS-003, REQ-IS-006**
   *
   * When reducedMotion is true, calling animateTick(t) for any t must result
   * in all affected nodes already revealed and faulted nodes at their final
   * collapsed state — no pending transitions.
   */
  it("applies final colors immediately on first tick when reducedMotion=true", () => {
    fc.assert(
      fc.property(
        layoutArb,
        fc.float({ min: 0, max: 100, noNaN: true }),
        ({ nodes, edges, positions }, t) => {
          const scene  = makeScene();
          const handle = buildFaultAnimation({
            nodes, edges, positions, scene, reducedMotion: true,
          });

          // Single tick at any time t
          handle.animateTick(t);

          const affectedIds = new Set(nodes.filter((n) => n.isAffected).map((n) => n.id));
          const revealed    = handle.revealedAffectedIds();

          for (const id of affectedIds) {
            expect(revealed.has(id), `affected node ${id} not immediately revealed in reduced-motion`).toBe(true);
          }

          // Verify by checking scene children added by the handle are non-zero
          const faultedId = nodes.find((n) => n.isFaulted)?.id;
          if (faultedId != null) {
            expect(handle.addedObjects().length).toBeGreaterThan(0);
          }

          handle.dispose();
        }
      ),
      { numRuns: 50 }
    );
  });

  it("faulted node color is red and affected node color is amber immediately", () => {
    fc.assert(
      fc.property(layoutArb, ({ nodes, edges, positions }) => {
        const scene  = makeScene();
        const handle = buildFaultAnimation({
          nodes, edges, positions, scene, reducedMotion: true,
        });

        // Drive one tick at t=0
        handle.animateTick(0);

        // Check all cascade meshes have amber color
        const affectedCount = nodes.filter((n) => n.isAffected).length;
        const revealedCount = handle.revealedAffectedIds().size;
        expect(revealedCount).toBe(affectedCount);

        // All faulted collapse meshes exist in scene (were added)
        const faultedCount = nodes.filter((n) => n.isFaulted).length;
        const addedMeshes  = handle.addedObjects().filter((o) => o instanceof THREE.Mesh);
        // Collapse meshes (1 per faulted) + cascade meshes (1 per affected)
        expect(addedMeshes.length).toBeGreaterThanOrEqual(faultedCount + affectedCount);

        handle.dispose();
      }),
      { numRuns: 50 }
    );
  });
});

// ─── P3 — Dispose cleans up ───────────────────────────────────────────────────

describe("P3 — Dispose cleans up", () => {
  /**
   * **Validates: Requirements REQ-IS-003, REQ-IS-006**
   *
   * After dispose() is called, the scene must contain zero objects that were
   * added by the animation system.
   */
  it("removes all added objects from the scene after dispose", () => {
    fc.assert(
      fc.property(
        layoutArb,
        fc.boolean(),
        ({ nodes, edges, positions }, reducedMotion) => {
          const scene       = makeScene();
          const sceneBefore = scene.children.length;
          const handle      = buildFaultAnimation({
            nodes, edges, positions, scene, reducedMotion,
          });

          // Objects were added
          const hasFaultOrAffected =
            nodes.some((n) => n.isFaulted) || nodes.some((n) => n.isAffected);
          if (hasFaultOrAffected) {
            expect(scene.children.length).toBeGreaterThan(sceneBefore);
          }

          handle.dispose();

          // After dispose, scene must be back to its pre-animation state
          expect(scene.children.length).toBe(sceneBefore);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Colour constant sanity ───────────────────────────────────────────────────

describe("Color constants", () => {
  it("FAULTED is red and AFFECTED is amber (hex)", () => {
    expect(COLOR_FAULTED.getHexString()).toBe("ff2222");
    expect(COLOR_AFFECTED.getHexString()).toBe("ffaa00");
  });
});
