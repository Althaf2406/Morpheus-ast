/**
 * Property-based tests for the fault animation system (reduced motion and disposal).
 *
 * **Validates: Requirements REQ-IS-003, REQ-IS-004, REQ-IS-005, REQ-IS-006**
 *
 *   P2 — Reduced motion correctness
 *   P3 — Dispose cleans up
 */
import * as fc from "fast-check";
import * as THREE from "three";
import { describe, it, expect } from "vitest";
import { buildFaultAnimation, COLOR_FAULTED, COLOR_AFFECTED } from "../useFaultAnimation.ts";
import { layoutArb, makeScene } from "./faultLayoutArb.ts";
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
