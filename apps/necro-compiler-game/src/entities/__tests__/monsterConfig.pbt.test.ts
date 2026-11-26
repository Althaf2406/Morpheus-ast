/**
 * Property-based tests for the monster visual configuration.
 *
 * **Validates: Requirements REQ-NC-002, REQ-NC-005, REQ-NC-010, REQ-NC-013**
 *
 *   P1 — The config is total and well-formed for every EntityType
 *   P2 — Radius and intensity are monotone in severity
 *   P3 — Animated meshes always fit the placed envelope
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { EntityType } from "../../adapter.ts";
import {
  MAX_SEVERITY_INTENSITY,
  MONSTER_CONFIG,
  SEVERITY_VISUAL,
  entityRadius,
  meshFill,
  type Severity,
} from "../monsterConfig.ts";

// The Records make the compiler reject a missing EntityType / Severity.
const TYPES: Record<EntityType, true> = {
  POLTERGEIST_DEMON_BOSS: true,
  POLTERGEIST_DEMON: true,
  ZOMBIE_VARIABLE: true,
  SHADOW_LINT_GHOST: true,
};
const RANK: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

const typeArb = fc.constantFrom(...(Object.keys(TYPES) as EntityType[]));
const severityArb = fc.constantFrom(...(Object.keys(RANK) as Severity[]));

describe("monster config", () => {
  it("P1: every EntityType maps to a well-formed config", () => {
    fc.assert(
      fc.property(typeArb, (type) => {
        const config = MONSTER_CONFIG[type];
        expect(config.color).toMatch(/^#[0-9a-f]{6}$/i);
        for (const value of [config.intensity, config.sizeScale, config.stretchY, config.bobSpeed, config.flicker]) {
          expect(Number.isFinite(value) && value > 0).toBe(true);
        }
        expect(config.displace).toBeGreaterThanOrEqual(0);
        expect(config.bobAmp).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(config.detail)).toBe(true);
      })
    );
  });

  it("the boss is bigger and fiercer than the demon; only the ghost is transparent", () => {
    const boss = MONSTER_CONFIG.POLTERGEIST_DEMON_BOSS;
    const demon = MONSTER_CONFIG.POLTERGEIST_DEMON;
    expect(boss.sizeScale).toBeGreaterThan(demon.sizeScale);
    expect(boss.intensity).toBeGreaterThan(demon.intensity);
    expect(boss.displace).toBeGreaterThan(demon.displace);
    expect(boss.flicker).toBeGreaterThan(demon.flicker);
    const transparent = (Object.keys(TYPES) as EntityType[]).filter((t) => MONSTER_CONFIG[t].transparent);
    expect(transparent).toEqual(["SHADOW_LINT_GHOST"]);
  });

  it("P2: radius and intensity never decrease as severity rises", () => {
    fc.assert(
      fc.property(typeArb, severityArb, severityArb, (type, a, b) => {
        const [low, high] = RANK[a] <= RANK[b] ? [a, b] : [b, a];
        expect(entityRadius(type, high)).toBeGreaterThanOrEqual(entityRadius(type, low));
        expect(SEVERITY_VISUAL[high].intensity).toBeGreaterThanOrEqual(SEVERITY_VISUAL[low].intensity);
      })
    );
  });

  it("P3: displacement and float at maximum intensity stay inside the envelope", () => {
    fc.assert(
      fc.property(typeArb, (type) => {
        const config = MONSTER_CONFIG[type];
        const reach = (1 + config.displace * MAX_SEVERITY_INTENSITY + config.bobAmp) * Math.max(1, config.stretchY);
        expect(meshFill(config) * reach).toBeLessThanOrEqual(1 + 1e-9);
      })
    );
  });
});
