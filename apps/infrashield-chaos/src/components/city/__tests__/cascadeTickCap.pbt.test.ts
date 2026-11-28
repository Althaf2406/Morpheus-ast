/**
 * Property 1: Cascade tick count never exceeds the cap.
 *
 * **Validates: Requirements 6.3, 8.7**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_CASCADE_TICKS, capCascadeReveal } from "../useFaultAnimation";

// --- Helpers ---
function forwardedCalls(count: number): number {
  let forwarded = 0;
  const capped = capCascadeReveal(() => {
    forwarded += 1;
  });
  if (!capped) throw new Error("expected a wrapped callback");
  for (let i = 0; i < count; i += 1) capped();
  return forwarded;
}

describe("Property 1: cascade tick cap", () => {
  it("forwards exactly min(count, 12) calls", () => {
    expect(MAX_CASCADE_TICKS).toBe(12);
    fc.assert(
      fc.property(fc.nat({ max: 500 }), (count) => {
        expect(forwardedCalls(count)).toBe(Math.min(count, 12));
      }),
      { numRuns: 100 }
    );
  });

  it("returns undefined when no callback is supplied", () => {
    expect(capCascadeReveal(undefined)).toBeUndefined();
  });
});
