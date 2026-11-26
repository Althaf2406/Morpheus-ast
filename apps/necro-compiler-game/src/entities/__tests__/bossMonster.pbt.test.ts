/**
 * Property-based test for boss-sized monsters.
 *
 * Boss size is a property of the entity and its room: POLTERGEIST_DEMON_BOSS always,
 * POLTERGEIST_DEMON inside a BOSS room. Zombies and ghosts never, and purifying a demon
 * must not make another monster in the room grow (the rule never looks at other entities).
 *
 * **Validates: Requirements 1.4**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { DungeonEntity, EntityType } from "../../adapter.ts";
import { placeRoomEntities, type Extent } from "../entityPlacement.ts";
import { severityScale, type Severity } from "../monsterConfig.ts";
import { isBossSized, monsterRadius, wallHeightFor } from "../scale.ts";
// --- Fixtures ---
const EPS = 1e-9;
const SEVERITIES: readonly Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const TYPES: readonly EntityType[] = [
  "POLTERGEIST_DEMON_BOSS", "POLTERGEIST_DEMON", "ZOMBIE_VARIABLE", "SHADOW_LINT_GHOST",
];
const entitiesArb: fc.Arbitrary<DungeonEntity[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 30 })
  .chain((ids) =>
    fc.tuple(...ids.map((entityId) =>
      fc.record({ type: fc.constantFrom(...TYPES), severity: fc.constantFrom(...SEVERITIES) })
        .map(({ type, severity }): DungeonEntity => ({
          entityId, findingId: entityId, type, severity, title: "", description: "", suggestedSpell: null,
        }))
    ))
  );
const extentArb: fc.Arbitrary<Extent> = fc.tuple(
  fc.double({ min: 1.5, max: 8, noNaN: true }),
  fc.double({ min: 1.5, max: 6, noNaN: true }),
  fc.double({ min: 1.5, max: 8, noNaN: true })
);
const origin = { x: 0, y: 0, z: 0 };
// --- Properties ---
describe("boss-sized monsters", () => {
  it("only boss demons, or plain demons in a BOSS room, may exceed the regular radius", () => {
    fc.assert(
      fc.property(entitiesArb, extentArb, fc.boolean(), (entities, extent, isBossRoom) => {
        const wallHeight = wallHeightFor(extent);
        for (const p of placeRoomEntities(entities, origin, extent, isBossRoom)) {
          const bound = monsterRadius(wallHeight, isBossSized(p.type, isBossRoom), severityScale(p.severity));
          expect(p.radius).toBeLessThanOrEqual(bound + EPS);
          if (p.type === "ZOMBIE_VARIABLE" || p.type === "SHADOW_LINT_GHOST") {
            expect(p.radius).toBeLessThanOrEqual(monsterRadius(wallHeight, false, severityScale(p.severity)) + EPS);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
  it("a room that is not a BOSS room gives plain demons the regular radius", () => {
    fc.assert(
      fc.property(entitiesArb, extentArb, (entities, extent) => {
        const wallHeight = wallHeightFor(extent);
        const demons = entities.filter((e) => e.type === "POLTERGEIST_DEMON");
        for (const p of placeRoomEntities(demons, origin, extent, false)) {
          expect(p.radius).toBeLessThanOrEqual(monsterRadius(wallHeight, false, severityScale(p.severity)) + EPS);
        }
      }),
      { numRuns: 100 },
    );
  });
});
