import type { EntityType } from "../adapter.ts";
import type { Extent } from "./entityPlacement.ts";

// --- Types ---

export interface ScaleResult {
  readonly regularMonsterHeight: number;
  readonly bossMonsterHeight: number;
  readonly pillarHeight: number;
  readonly pillarGirth: number;
}


// --- Constants ---

/** Fraction of the room extent height that becomes the wall height. */
const WALL_HEIGHT_FRACTION = 0.3;
/** Fraction of Wall_Height a Regular_Demon occupies, kept inside [0.30, 0.40]. */
export const REGULAR_MONSTER_FRACTION = 0.35;
export const BOSS_MONSTER_FRACTION = 0.52;
export const PILLAR_HEIGHT_FACTOR = 1.0;
export const PILLAR_GIRTH_FACTOR = 0.09;


// --- Scale ---

export function wallHeightFor(extent: Extent): number {
  return extent[1] * WALL_HEIGHT_FRACTION;
}

/** Single source of monster and pillar size: everything derives from Wall_Height. */
export function scaleFor(wallHeight: number): ScaleResult {
  return {
    regularMonsterHeight: wallHeight * REGULAR_MONSTER_FRACTION,
    bossMonsterHeight: wallHeight * BOSS_MONSTER_FRACTION,
    pillarHeight: wallHeight * PILLAR_HEIGHT_FACTOR,
    pillarGirth: wallHeight * PILLAR_GIRTH_FACTOR,
  };
}

/** Severity modulates size inside the Scale_Function envelope. */
export function monsterRadius(wallHeight: number, isBoss: boolean, severityScale: number): number {
  const scale = scaleFor(wallHeight);
  const height = isBoss ? scale.bossMonsterHeight : scale.regularMonsterHeight;
  return (height / 2) * severityScale;
}

// --- Boss rule ---
/**
 * Boss size depends only on the entity itself and its room, never on the other entities:
 * a boss demon always, a plain demon only inside a boss room. Zombies and ghosts never.
 */
export function isBossSized(type: EntityType, isBossRoom: boolean): boolean {
  return type === "POLTERGEIST_DEMON_BOSS" || (type === "POLTERGEIST_DEMON" && isBossRoom);
}
