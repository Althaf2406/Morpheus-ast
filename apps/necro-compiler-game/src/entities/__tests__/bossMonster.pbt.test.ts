/**
 * Property-based test for Boss_Monster selection.
 *
 * **Feature: necro-visual-polish, Property 5: Boss_Monster is the highest-severity entity, ties to the lowest id**
 * **Validates: Requirements 1.4**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { DungeonEntity } from "../../adapter.ts";
import { placeRoomEntities, type Extent } from "../entityPlacement.ts";
import { severityScale, type Severity } from "../monsterConfig.ts";
import { bossMonsterId, monsterRadius, wallHeightFor, type BossCandidate } from "../scale.ts";

// --- Fixtures ---

const EPS = 1e-9;
const SEVERITIES: readonly Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const RANK: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

const candidatesArb: fc.Arbitrary<BossCandidate[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 30 })
  .chain((ids) =>
    fc.tuple(...ids.map((entityId) =>
      fc.constantFrom(...SEVERITIES).map((severity) => ({ entityId, severity }))
    ))
  );

const toEntity = (c: BossCandidate): DungeonEntity => ({
  entityId: c.entityId, findingId: c.entityId, type: "POLTERGEIST_DEMON",
  severity: c.severity, title: "", description: "", suggestedSpell: null,
});

const extentArb: fc.Arbitrary<Extent> = fc.tuple(
  fc.double({ min: 1.5, max: 8, noNaN: true }),
  fc.double({ min: 1.5, max: 6, noNaN: true }),
  fc.double({ min: 1.5, max: 8, noNaN: true })
);

// --- Properties ---

describe("Property 5: Boss_Monster selection", () => {
  it("returns the highest-severity entity, ties to the lowest id", () => {
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const top = Math.max(...candidates.map((c) => RANK[c.severity]));
        const expected = candidates
          .filter((c) => RANK[c.severity] === top)
          .map((c) => c.entityId)
          .reduce((lowest, id) => (id < lowest ? id : lowest));
        expect(bossMonsterId(candidates)).toBe(expected);
        expect(bossMonsterId([...candidates].reverse())).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("returns null for an empty room", () => {
    expect(bossMonsterId([])).toBeNull();
  });

  it("a room that is not a Boss_Room never receives the boss radius", () => {
    fc.assert(
      fc.property(candidatesArb, extentArb, (candidates, extent) => {
        const origin = { x: 0, y: 0, z: 0 };
        const wallHeight = wallHeightFor(extent);
        const placed = placeRoomEntities(candidates.map(toEntity), origin, extent, false);
        for (const p of placed) {
          expect(p.radius).toBeLessThanOrEqual(monsterRadius(wallHeight, false, severityScale(p.severity)) + EPS);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("in a Boss_Room only the Boss_Monster may exceed the regular radius", () => {
    fc.assert(
      fc.property(candidatesArb, extentArb, (candidates, extent) => {
        const origin = { x: 0, y: 0, z: 0 };
        const wallHeight = wallHeightFor(extent);
        const bossId = bossMonsterId(candidates);
        const placed = placeRoomEntities(candidates.map(toEntity), origin, extent, true);
        for (const p of placed) {
          const isBoss = p.entityId === bossId;
          const bound = monsterRadius(wallHeight, isBoss, severityScale(p.severity));
          expect(p.radius).toBeLessThanOrEqual(bound + EPS);
        }
      }),
      { numRuns: 100 },
    );
  });
});
