/**
 * Property-based tests for the force-directed dungeon room layout.
 *
 * **Validates: Requirements REQ-NC-005**
 *
 * Four properties under test:
 *   P1 — Determinism
 *   P2 — No NaN / Infinity
 *   P3 — No overlap
 *   P4 — BOSS rooms are higher
 */

import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { computeForceLayout, SIZE_RADIUS } from "../forceLayout.ts";
import type { DungeonRoom, DungeonCorridor, RoomSize } from "../../adapter.ts";
import { mockDungeonLayout } from "../../mock/dungeonLayout.ts";

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const sizeArb: fc.Arbitrary<RoomSize> = fc.constantFrom(
  "SMALL" as RoomSize,
  "MEDIUM" as RoomSize,
  "LARGE" as RoomSize,
  "BOSS" as RoomSize
);

const complexityForSize = (size: RoomSize): fc.Arbitrary<number> => {
  switch (size) {
    case "BOSS":   return fc.integer({ min: 15, max: 25 });
    case "LARGE":  return fc.integer({ min: 6,  max: 14 });
    case "MEDIUM": return fc.integer({ min: 3,  max: 5  });
    case "SMALL":  return fc.integer({ min: 1,  max: 2  });
  }
};

const roomArb = (id: string): fc.Arbitrary<DungeonRoom> =>
  sizeArb.chain((size) =>
    complexityForSize(size).map((cc) => ({
      id,
      functionName:          `fn_${id}`,
      filePath:              `src/${id}.ts`,
      size,
      cyclomaticComplexity:  cc,
      isCircularDep:         false,
      entities:              [],
      corridorIds:           [],
    }))
  );

/** Generates 2–10 rooms with unique ids and 0 to N-1 corridors. */
const layoutArb = fc.integer({ min: 2, max: 10 }).chain((n) => {
  const ids   = Array.from({ length: n }, (_, i) => `r${i}`);
  const rooms = fc.tuple(...ids.map((id) => roomArb(id)));

  const corridorsArb = fc.array(
    fc.tuple(
      fc.integer({ min: 0, max: n - 1 }),
      fc.integer({ min: 0, max: n - 1 })
    ).filter(([a, b]) => a !== b),
    { minLength: 0, maxLength: n - 1 }
  ).map((pairs) =>
    pairs.map(([a, b], i): DungeonCorridor => ({
      id:                 `c${i}`,
      fromRoomId:         ids[a],
      toRoomId:           ids[b],
      isInfiniteLoopCurse: false,
    }))
  );

  return fc.tuple(rooms, corridorsArb).map(([roomTuple, corridors]) => ({
    rooms: roomTuple as unknown as DungeonRoom[],
    corridors,
  }));
});

// ─── P1 — Determinism ─────────────────────────────────────────────────────────

describe("P1 — Determinism", () => {
  it("produces identical positions for the same input called twice", () => {
    fc.assert(
      fc.property(layoutArb, ({ rooms, corridors }) => {
        const r1 = computeForceLayout(rooms, corridors);
        const r2 = computeForceLayout(rooms, corridors);

        for (const room of rooms) {
          const p1 = r1.positions.get(room.id);
          const p2 = r2.positions.get(room.id);
          expect(p1).toBeDefined();
          expect(p2).toBeDefined();
          if (p1 == null || p2 == null) return;
          expect(p1.x).toBeCloseTo(p2.x, 8);
          expect(p1.y).toBeCloseTo(p2.y, 8);
          expect(p1.z).toBeCloseTo(p2.z, 8);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── P2 — No NaN / Infinity ───────────────────────────────────────────────────

describe("P2 — No NaN / Infinity", () => {
  it("all position components are finite numbers", () => {
    fc.assert(
      fc.property(layoutArb, ({ rooms, corridors }) => {
        const result = computeForceLayout(rooms, corridors);

        for (const room of rooms) {
          const p = result.positions.get(room.id);
          expect(p).toBeDefined();
          if (p == null) return;
          expect(Number.isFinite(p.x), `x not finite for ${room.id}`).toBe(true);
          expect(Number.isFinite(p.y), `y not finite for ${room.id}`).toBe(true);
          expect(Number.isFinite(p.z), `z not finite for ${room.id}`).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── P3 — No overlap ─────────────────────────────────────────────────────────

describe("P3 — No overlap", () => {
  it("center-to-center distance exceeds sum of sizeRadius values for every pair", () => {
    fc.assert(
      fc.property(layoutArb, ({ rooms, corridors }) => {
        const result = computeForceLayout(rooms, corridors);
        const tolerance = 0.1;

        for (let a = 0; a < rooms.length; a++) {
          for (let b = a + 1; b < rooms.length; b++) {
            const pa = result.positions.get(rooms[a].id);
            const pb = result.positions.get(rooms[b].id);
            if (pa == null || pb == null) continue;

            const dx   = pa.x - pb.x;
            const dz   = pa.z - pb.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minD = SIZE_RADIUS[rooms[a].size] + SIZE_RADIUS[rooms[b].size] - tolerance;

            expect(dist, `rooms ${rooms[a].id} and ${rooms[b].id} overlap (dist=${dist.toFixed(2)}, min=${minD.toFixed(2)})`).toBeGreaterThan(minD);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── P4 — BOSS rooms are higher ───────────────────────────────────────────────

describe("P4 — BOSS rooms are higher", () => {
  it("every BOSS room y is strictly greater than every non-BOSS room y", () => {
    fc.assert(
      fc.property(layoutArb, ({ rooms, corridors }) => {
        const hasBoss    = rooms.some((r) => r.size === "BOSS");
        const hasNonBoss = rooms.some((r) => r.size !== "BOSS");
        if (!hasBoss || !hasNonBoss) return;

        const result = computeForceLayout(rooms, corridors);

        const bossYs    = rooms.filter((r) => r.size === "BOSS")
          .map((r) => result.positions.get(r.id)?.y ?? 0);
        const nonBossYs = rooms.filter((r) => r.size !== "BOSS")
          .map((r) => result.positions.get(r.id)?.y ?? 0);

        const minBossY    = Math.min(...bossYs);
        const maxNonBossY = Math.max(...nonBossYs);

        expect(minBossY, `min BOSS y (${minBossY}) not > max non-BOSS y (${maxNonBossY})`).toBeGreaterThan(maxNonBossY);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── P5 — Mock layout bounding radius < 60 ────────────────────────────────────

describe("P5 — Mock layout bounding radius", () => {
  it("12-room mock layout settles within a bounding radius of 60 units", () => {
    const { rooms, corridors } = mockDungeonLayout;
    const result = computeForceLayout(rooms, corridors);

    // Centroid of all positions
    const centroid = { x: 0, z: 0 };
    for (const p of result.positions.values()) {
      centroid.x += p.x;
      centroid.z += p.z;
    }
    centroid.x /= result.positions.size;
    centroid.z /= result.positions.size;

    // Max distance from centroid on XZ plane
    let maxRadius = 0;
    for (const p of result.positions.values()) {
      const dx = p.x - centroid.x;
      const dz = p.z - centroid.z;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d > maxRadius) maxRadius = d;
    }

    expect(
      maxRadius,
      `bounding radius ${maxRadius.toFixed(2)} exceeds 60 — layout is too spread out`
    ).toBeLessThan(60);
  });
});
