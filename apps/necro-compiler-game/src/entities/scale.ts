import type { Extent } from "./entityPlacement.ts";
import type { Severity } from "./monsterConfig.ts";

// --- Types ---

export interface ScaleResult {
  readonly regularMonsterHeight: number;
  readonly bossMonsterHeight: number;
  readonly pillarHeight: number;
  readonly pillarGirth: number;
}

export interface BossCandidate {
  readonly entityId: string;
  readonly severity: Severity;
}

// --- Constants ---

/** Fraction of the room extent height that becomes the wall height. */
const WALL_HEIGHT_FRACTION = 0.3;
/** Fraction of Wall_Height a Regular_Demon occupies, kept inside [0.30, 0.40]. */
export const REGULAR_MONSTER_FRACTION = 0.35;
export const BOSS_MONSTER_FRACTION = 0.52;
export const PILLAR_HEIGHT_FACTOR = 1.0;
export const PILLAR_GIRTH_FACTOR = 0.09;

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

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

/** Highest severity wins, ties go to the lowest entity id, null for an empty room. */
export function bossMonsterId(entities: readonly BossCandidate[]): string | null {
  let best: BossCandidate | null = null;
  for (const entity of entities) {
    if (best === null) {
      best = entity;
      continue;
    }
    const rankDiff = SEVERITY_RANK[entity.severity] - SEVERITY_RANK[best.severity];
    if (rankDiff > 0 || (rankDiff === 0 && entity.entityId < best.entityId)) best = entity;
  }
  return best === null ? null : best.entityId;
}
