/**
 * Unit tests for the Scale_Function and the Boss_Monster rule.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */
import { describe, it, expect } from "vitest";
import {
  BOSS_MONSTER_FRACTION,
  REGULAR_MONSTER_FRACTION,
  isBossSized,
  monsterRadius,
  scaleFor,
  wallHeightFor,
} from "../scale.ts";

describe("scaleFor", () => {
  it("derives every dimension from a wall height of 2", () => {
    const result = scaleFor(2);
    expect(result.regularMonsterHeight).toBeCloseTo(2 * REGULAR_MONSTER_FRACTION, 12);
    expect(result.bossMonsterHeight).toBeCloseTo(2 * BOSS_MONSTER_FRACTION, 12);
    expect(result.pillarHeight).toBeCloseTo(2, 12);
    expect(result.pillarGirth).toBeCloseTo(0.18, 12);
  });

  it("returns zero dimensions for a wall height of 0", () => {
    expect(scaleFor(0)).toEqual({
      regularMonsterHeight: 0,
      bossMonsterHeight: 0,
      pillarHeight: 0,
      pillarGirth: 0,
    });
  });
});

describe("monsterRadius", () => {
  it("is half the regular height at severity scale 1", () => {
    expect(monsterRadius(4, false, 1)).toBeCloseTo(0.7, 12);
  });

  it("is half the boss height at severity scale 1", () => {
    expect(monsterRadius(4, true, 1)).toBeCloseTo(1.04, 12);
  });

  it("multiplies by the severity scale", () => {
    expect(monsterRadius(4, false, 1.3)).toBeCloseTo(0.7 * 1.3, 12);
  });
});

describe("wallHeightFor", () => {
  it("takes 30% of the extent height", () => {
    expect(wallHeightFor([6, 10, 6])).toBeCloseTo(3, 12);
  });
});

describe("isBossSized", () => {
  it("is true for a boss demon in any room", () => {
    expect(isBossSized("POLTERGEIST_DEMON_BOSS", false)).toBe(true);
    expect(isBossSized("POLTERGEIST_DEMON_BOSS", true)).toBe(true);
  });
  it("is true for a plain demon only in a boss room", () => {
    expect(isBossSized("POLTERGEIST_DEMON", true)).toBe(true);
    expect(isBossSized("POLTERGEIST_DEMON", false)).toBe(false);
  });
  it("is never true for zombies and ghosts", () => {
    for (const type of ["ZOMBIE_VARIABLE", "SHADOW_LINT_GHOST"] as const) {
      expect(isBossSized(type, true)).toBe(false);
      expect(isBossSized(type, false)).toBe(false);
    }
  });
});
