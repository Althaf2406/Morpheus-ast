/**
 * Property-based tests for deterministic entity placement inside rooms.
 *
 * **Validates: Requirements REQ-NC-004, REQ-NC-005, REQ-NC-013**
 *
 *   P1 — Deterministic and independent of input order
 *   P2 — Every entity sphere lies inside the room box
 *   P3 — No two entity spheres overlap
 *   P4 — Radius and intensity are monotone in severity
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { DungeonEntity, EntityType } from "../../adapter.ts";
import { placeRoomEntities, type Extent } from "../entityPlacement.ts";
import type { Severity } from "../monsterConfig.ts";

const EPS = 1e-6;
const TYPES: readonly EntityType[] = [
  "POLTERGEIST_DEMON_BOSS", "POLTERGEIST_DEMON", "ZOMBIE_VARIABLE", "SHADOW_LINT_GHOST",
];
const SEVERITIES: readonly Severity[] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

const makeEntity = (entityId: string, type: EntityType, severity: Severity): DungeonEntity => ({
  entityId, findingId: entityId, type, severity, title: "", description: "", suggestedSpell: null,
});

const entitiesArb: fc.Arbitrary<DungeonEntity[]> = fc
  .uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 40 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) =>
      fc.record({ type: fc.constantFrom(...TYPES), severity: fc.constantFrom(...SEVERITIES) })
        .map(({ type, severity }) => makeEntity(id, type, severity))
    ))
  );
const extentArb: fc.Arbitrary<Extent> = fc.tuple(
  fc.double({ min: 1.5, max: 8, noNaN: true }),
  fc.double({ min: 1.5, max: 6, noNaN: true }),
  fc.double({ min: 1.5, max: 8, noNaN: true })
);
const originArb = fc.record({
  x: fc.double({ min: -100, max: 100, noNaN: true }),
  y: fc.double({ min: 0, max: 5, noNaN: true }),
  z: fc.double({ min: -100, max: 100, noNaN: true }),
});

describe("entity placement", () => {
  it("P1: is deterministic and independent of input order", () => {
    fc.assert(
      fc.property(entitiesArb, originArb, extentArb, (entities, origin, extent) => {
        const first = placeRoomEntities(entities, origin, extent);
        expect(placeRoomEntities(entities, origin, extent)).toEqual(first);
        expect(placeRoomEntities([...entities].reverse(), origin, extent)).toEqual(first);
      })
    );
  });

  it("P2: every entity sphere lies inside the room box", () => {
    fc.assert(
      fc.property(entitiesArb, originArb, extentArb, (entities, origin, [w, h, d]) => {
        for (const p of placeRoomEntities(entities, origin, [w, h, d])) {
          expect(p.radius).toBeGreaterThan(0);
          expect(Math.abs(p.x - origin.x) + p.radius).toBeLessThanOrEqual(w / 2 + EPS);
          expect(Math.abs(p.z - origin.z) + p.radius).toBeLessThanOrEqual(d / 2 + EPS);
          expect(p.y - p.radius).toBeGreaterThanOrEqual(origin.y - EPS);
          expect(p.y + p.radius).toBeLessThanOrEqual(origin.y + h + EPS);
        }
      })
    );
  });

  it("P3: no two entity spheres overlap", () => {
    fc.assert(
      fc.property(entitiesArb, originArb, extentArb, (entities, origin, extent) => {
        const placed = placeRoomEntities(entities, origin, extent);
        for (let a = 0; a < placed.length; a++) {
          for (let b = a + 1; b < placed.length; b++) {
            const dist = Math.hypot(placed[a].x - placed[b].x, placed[a].y - placed[b].y, placed[a].z - placed[b].z);
            expect(dist).toBeGreaterThanOrEqual(placed[a].radius + placed[b].radius - EPS);
          }
        }
      })
    );
  });

  it("P4: higher severity never gets a smaller radius or lower intensity", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES), originArb, extentArb,
        fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 }),
        (type, origin, extent, i, j) => {
          const [low, high] = [Math.min(i, j), Math.max(i, j)];
          const [a] = placeRoomEntities([makeEntity("e", type, SEVERITIES[low])], origin, extent);
          const [b] = placeRoomEntities([makeEntity("e", type, SEVERITIES[high])], origin, extent);
          expect(b.radius).toBeGreaterThanOrEqual(a.radius);
          expect(b.intensity).toBeGreaterThanOrEqual(a.intensity);
        }
      )
    );
  });

  it("returns nothing for an empty room", () => {
    expect(placeRoomEntities([], { x: 0, y: 0, z: 0 }, [4, 3, 4])).toEqual([]);
  });
});
