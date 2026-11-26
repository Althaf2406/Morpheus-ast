/**
 * Property-based test that the Scale_Function is the only source of size.
 *
 * **Feature: necro-visual-polish, Property 4: Scale_Function is the only source of monster and pillar size**
 * **Validates: Requirements 1.1, 1.2**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { DungeonEntity, EntityType } from "../../adapter.ts";
import { buildRoomParts } from "../../components/dungeon/roomParts.ts";
import { placeRoomEntities, type Extent } from "../entityPlacement.ts";
import { severityScale, type Severity } from "../monsterConfig.ts";
import { isBossSized, monsterRadius, scaleFor, wallHeightFor } from "../scale.ts";

// --- Generators ---

const TYPES: readonly EntityType[] = [
  "POLTERGEIST_DEMON_BOSS", "POLTERGEIST_DEMON", "ZOMBIE_VARIABLE", "SHADOW_LINT_GHOST",
];
const SEVERITIES: readonly Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

const makeEntity = (entityId: string, type: EntityType, severity: Severity): DungeonEntity => ({
  entityId, findingId: entityId, type, severity, title: "", description: "", suggestedSpell: null,
});

const entitiesArb: fc.Arbitrary<DungeonEntity[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 4 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) =>
      fc.record({ type: fc.constantFrom(...TYPES), severity: fc.constantFrom(...SEVERITIES) })
        .map(({ type, severity }) => makeEntity(id, type, severity))
    ))
  );

/** Width and depth are at least the room height so the placement clamp never binds. */
const extentArb: fc.Arbitrary<Extent> = fc
  .double({ min: 1.5, max: 6, noNaN: true })
  .chain((height) =>
    fc.tuple(
      fc.double({ min: height, max: 12, noNaN: true }),
      fc.constant(height),
      fc.double({ min: height, max: 12, noNaN: true })
    )
  );

const originArb = fc.record({
  x: fc.double({ min: -100, max: 100, noNaN: true }),
  y: fc.double({ min: 0, max: 5, noNaN: true }),
  z: fc.double({ min: -100, max: 100, noNaN: true }),
});

// --- Property ---

describe("scale source", () => {
  it("P4: placed monster radius equals monsterRadius derived from wallHeightFor(extent)", () => {
    fc.assert(
      fc.property(entitiesArb, originArb, extentArb, fc.boolean(), (entities, origin, extent, isBossRoom) => {
        const wallHeight = wallHeightFor(extent);
        for (const placed of placeRoomEntities(entities, origin, extent, isBossRoom)) {
          const expected = monsterRadius(wallHeight, isBossSized(placed.type, isBossRoom), severityScale(placed.severity));
          expect(placed.radius).toBe(expected);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("P4: built pillar dimensions equal scaleFor(wallHeightFor(extent))", () => {
    fc.assert(
      fc.property(originArb, extentArb, fc.boolean(), (origin, extent, isBoss) => {
        const { pillarHeight, pillarGirth } = scaleFor(wallHeightFor(extent));
        const { pillars } = buildRoomParts(origin, extent, isBoss);
        expect(pillars).toHaveLength(4);
        for (const pillar of pillars) {
          expect(pillar.sy).toBe(pillarHeight);
          expect(pillar.sx).toBe(pillarGirth);
          expect(pillar.sz).toBe(pillarGirth);
        }
      }),
      { numRuns: 200 },
    );
  });
});
