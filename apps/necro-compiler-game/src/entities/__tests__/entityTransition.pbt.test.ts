/**
 * Property-based tests for the entity visual transition.
 *
 * **Validates: Requirements REQ-NC-006**
 *
 *   P1 — Progress always lies in [0, 1]
 *   P2 — Progress is monotone in elapsed time
 *   P3 — Reduced motion is instant (independent of elapsed time)
 *   P4 — A track restarts only when the phase changes
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import {
  DYING_SECONDS,
  PURIFY_SECONDS,
  REVIVE_SECONDS,
  reviveProgress,
  advanceTrack,
  transitionProgress,
  type EntityVisualState,
} from "../entityTransition.ts";

const phaseArb = fc.constantFrom<EntityVisualState>("ALIVE", "DYING", "PURIFIED");
const elapsedArb = fc.oneof(
  fc.double({ min: -10, max: 20, noNaN: true }),
  fc.constantFrom(Infinity, -Infinity, 0)
);

describe("entity transition", () => {
  it("P1: progress stays within [0, 1]", () => {
    fc.assert(
      fc.property(phaseArb, elapsedArb, fc.boolean(), (phase, elapsed, reduced) => {
        const { dissolve, purify } = transitionProgress(phase, elapsed, reduced);
        for (const value of [dissolve, purify]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      })
    );
  });

  it("P2: progress never decreases as time passes", () => {
    fc.assert(
      fc.property(phaseArb, elapsedArb, elapsedArb, fc.boolean(), (phase, a, b, reduced) => {
        const early = transitionProgress(phase, Math.min(a, b), reduced);
        const late = transitionProgress(phase, Math.max(a, b), reduced);
        expect(late.dissolve).toBeGreaterThanOrEqual(early.dissolve);
        expect(late.purify).toBeGreaterThanOrEqual(early.purify);
      })
    );
  });

  it("P3: with reduced motion the result does not depend on elapsed time", () => {
    fc.assert(
      fc.property(phaseArb, elapsedArb, elapsedArb, (phase, a, b) => {
        expect(transitionProgress(phase, a, true)).toEqual(transitionProgress(phase, b, true));
      })
    );
  });

  it("completes dying and purifying after their durations", () => {
    expect(transitionProgress("DYING", 0, false).dissolve).toBe(0);
    expect(transitionProgress("DYING", DYING_SECONDS, false).dissolve).toBe(1);
    expect(transitionProgress("PURIFIED", PURIFY_SECONDS, false).purify).toBe(1);
  });

  it("P4: advanceTrack keeps `since` for the same phase and restarts on change", () => {
    fc.assert(
      fc.property(phaseArb, phaseArb, fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 100, max: 200, noNaN: true }),
        (first, next, start, now) => {
          const track = advanceTrack(undefined, first, start);
          expect(track).toEqual({ phase: first, since: start });
          expect(advanceTrack(track, next, now)).toEqual(
            next === first ? track : { phase: next, since: now }
          );
        }
      )
    );
  });

  it("revive fades the husk back to alive and is instant with reduced motion", () => {
    expect(reviveProgress(0, false).dissolve).toBe(1);
    expect(reviveProgress(REVIVE_SECONDS, false).dissolve).toBe(0);
    expect(reviveProgress(0, true).dissolve).toBe(0);
  });
});
