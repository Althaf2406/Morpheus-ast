/**
 * Property-based test for torch allocation determinism.
 *
 * **Feature: necro-visual-polish, Property 10: Allocation is deterministic and independent of input order**
 * **Validates: Requirements 2.6**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { allocateTorches } from "../torchAllocation.ts";
// --- Generators ---
const idsArb = fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 10 });
const permutedWithDuplicatesArb = idsArb.chain((ids) =>
  fc
    .tuple(
      fc.shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length }),
      fc.shuffledSubarray(ids),
    )
    .map(([permuted, extras]) => ({ ids, variant: [...extras, ...permuted] })),
);
// --- Property ---
describe("Property 10: allocation is deterministic and independent of input order", () => {
  it("returns identical slots for any permutation or duplication of the ids", () => {
    fc.assert(
      fc.property(permutedWithDuplicatesArb, ({ ids, variant }) => {
        expect(allocateTorches(variant)).toEqual(allocateTorches(ids));
        expect(allocateTorches(ids)).toEqual(allocateTorches(ids));
      }),
      { numRuns: 100 },
    );
  });
  it("orders slots by ascending room id in code-unit order", () => {
    fc.assert(
      fc.property(idsArb, (ids) => {
        const roomIds = allocateTorches(ids).map((slot) => slot.roomId);
        const expected = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        expect([...new Set(roomIds)]).toEqual(expected);
        for (let i = 1; i < roomIds.length; i += 1) {
          expect(roomIds[i - 1] <= roomIds[i]).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
