// @vitest-environment jsdom
/**
 * Property-based tests for useStableRoomPositions.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
 *
 * Property 1 — Unchanged room-id set keeps every position identical.
 * Property 2 — Adding rooms never moves an existing room.
 * Property 3 — Removing rooms never moves a surviving room.
 */
import * as fc from "fast-check";
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useStableRoomPositions } from "../useStableRoomPositions.ts";
import type { DungeonRoom, DungeonCorridor, RoomSize } from "../../adapter.ts";

// --- Types ---

interface LayoutInput {
  readonly rooms: readonly DungeonRoom[];
  readonly corridors: readonly DungeonCorridor[];
}

// --- Arbitraries ---

const sizeArb: fc.Arbitrary<RoomSize> = fc.constantFrom<RoomSize>("SMALL", "MEDIUM", "LARGE", "BOSS");

function makeRoom(id: string, size: RoomSize): DungeonRoom {
  return {
    id,
    functionName: `fn_${id}`,
    filePath: `src/${id}.ts`,
    size,
    cyclomaticComplexity: 1,
    isCircularDep: false,
    entities: [],
    corridorIds: [],
  };
}

function corridorsArb(ids: readonly string[]): fc.Arbitrary<DungeonCorridor[]> {
  const last = ids.length - 1;
  return fc
    .array(
      fc.tuple(fc.integer({ min: 0, max: last }), fc.integer({ min: 0, max: last })).filter(([a, b]) => a !== b),
      { maxLength: last }
    )
    .map((pairs) =>
      pairs.map(([a, b], i) => ({
        id: `c${i}`,
        fromRoomId: ids[a],
        toRoomId: ids[b],
        isInfiniteLoopCurse: false,
      }))
    );
}

/** Two layouts that share one room-id set but differ in order, sizes and corridors. */
const sameIdSetArb: fc.Arbitrary<readonly [LayoutInput, LayoutInput]> = fc
  .integer({ min: 2, max: 10 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `r${i}`);
    const layoutFor = (order: readonly string[]): fc.Arbitrary<LayoutInput> =>
      fc.tuple(fc.array(sizeArb, { minLength: n, maxLength: n }), corridorsArb(ids)).map(([sizes, corridors]) => ({
        rooms: order.map((id) => makeRoom(id, sizes[ids.indexOf(id)])),
        corridors,
      }));
    return fc
      .shuffledSubarray(ids, { minLength: n, maxLength: n })
      .chain((shuffled) => fc.tuple(layoutFor(ids), layoutFor(shuffled)));
  });

// --- Property 1 ---

describe("Property 1 — Unchanged room-id set keeps every position identical", () => {
  it("returns reference-equal positions for every room id after rerendering with the same id set", () => {
    fc.assert(
      fc.property(sameIdSetArb, ([first, second]) => {
        const { result, rerender } = renderHook((input: LayoutInput) => useStableRoomPositions(input.rooms, input.corridors), {
          initialProps: first,
        });
        const before = result.current;
        const snapshot = new Map(before);

        rerender(second);

        for (const room of second.rooms) {
          const after = result.current.get(room.id);
          expect(after).toBeDefined();
          expect(after).toBe(snapshot.get(room.id));
        }
        expect(result.current).toBe(before);
      }),
      { numRuns: 100 }
    );
  });
});

// --- Arbitraries for Property 2 ---

function layoutArb(ids: readonly string[]): fc.Arbitrary<LayoutInput> {
  return fc
    .tuple(fc.array(sizeArb, { minLength: ids.length, maxLength: ids.length }), corridorsArb(ids))
    .map(([sizes, corridors]) => ({
      rooms: ids.map((id, i) => makeRoom(id, sizes[i])),
      corridors,
    }));
}

/** A layout and a second layout holding every id of the first plus one or more new ids. */
const addedRoomsArb: fc.Arbitrary<{ readonly base: LayoutInput; readonly grown: LayoutInput; readonly addedIds: readonly string[] }> = fc
  .tuple(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 4 }))
  .chain(([baseCount, addedCount]) => {
    const baseIds = Array.from({ length: baseCount }, (_, i) => `r${i}`);
    const addedIds = Array.from({ length: addedCount }, (_, i) => `a${i}`);
    return fc
      .tuple(layoutArb(baseIds), layoutArb([...baseIds, ...addedIds]))
      .map(([base, grown]) => ({ base, grown, addedIds }));
  });

// --- Property 2 ---

describe("Property 2 — Adding rooms never moves an existing room", () => {
  it("keeps every existing room position and gives each new room a defined position", () => {
    fc.assert(
      fc.property(addedRoomsArb, ({ base, grown, addedIds }) => {
        const { result, rerender } = renderHook((input: LayoutInput) => useStableRoomPositions(input.rooms, input.corridors), {
          initialProps: base,
        });
        const snapshot = new Map(result.current);

        rerender(grown);

        for (const room of base.rooms) {
          const after = result.current.get(room.id);
          expect(after).toBeDefined();
          expect(after).toBe(snapshot.get(room.id));
        }
        for (const id of addedIds) {
          expect(result.current.get(id)).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// --- Arbitraries for Property 3 ---

/** A layout and a second layout holding a non-empty strict subset of its room ids. */
const removedRoomsArb: fc.Arbitrary<{ readonly full: LayoutInput; readonly reduced: LayoutInput }> = fc
  .integer({ min: 2, max: 10 })
  .chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => `r${i}`);
    return fc
      .tuple(layoutArb(ids), fc.shuffledSubarray(ids, { minLength: 1, maxLength: n - 1 }).chain((kept) => layoutArb(kept)))
      .map(([full, reduced]) => ({ full, reduced }));
  });

// --- Property 3 ---

describe("Property 3 — Removing rooms never moves a surviving room", () => {
  it("keeps the position of every room still present after rooms are removed", () => {
    fc.assert(
      fc.property(removedRoomsArb, ({ full, reduced }) => {
        const { result, rerender } = renderHook((input: LayoutInput) => useStableRoomPositions(input.rooms, input.corridors), {
          initialProps: full,
        });
        const snapshot = new Map(result.current);

        rerender(reduced);

        for (const room of reduced.rooms) {
          const after = result.current.get(room.id);
          expect(after).toBeDefined();
          expect(after).toBe(snapshot.get(room.id));
        }
      }),
      { numRuns: 100 }
    );
  });
});
