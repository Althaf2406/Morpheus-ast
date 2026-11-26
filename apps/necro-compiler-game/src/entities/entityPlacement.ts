import type { DungeonEntity, EntityType } from "../adapter.ts";
import { SEVERITY_VISUAL, severityScale, type Severity } from "./monsterConfig.ts";
import { isBossSized, monsterRadius, wallHeightFor } from "./scale.ts";

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Room box size: [width, height, depth]. The origin is the centre of the floor. */
export type Extent = readonly [number, number, number];

export interface PlacedEntity {
  readonly entityId: string;
  readonly type: EntityType;
  readonly severity: Severity;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly intensity: number;
  /** Stable value in [0, 1) that decorrelates the animation of each entity. */
  readonly seed: number;
}

// --- Constants ---

/** Fraction of the room width/depth kept free along each wall. */
const WALL_MARGIN = 0.1;
/** An entity never takes more than this fraction of the room height as radius. */
const MAX_HEIGHT_FRACTION = 0.4;

// --- Deterministic hashing (FNV-1a + avalanche) ---

export function hash01(text: string, salt: number): number {
  let h = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- Placement ---

/**
 * Places entities on a grid inside the room. Each entity owns one cell and its
 * sphere never leaves that cell, so entities stay inside the room and never
 * overlap. Order of input does not matter (entities are sorted by id).
 */
export function placeRoomEntities(
  entities: readonly DungeonEntity[],
  origin: Vec3Like,
  extent: Extent,
  isBossRoom: boolean
): PlacedEntity[] {
  if (entities.length === 0) return [];
  const [width, height, depth] = extent;
  const sorted = [...entities].sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0));
  const cols = Math.ceil(Math.sqrt(sorted.length));
  const rows = Math.ceil(sorted.length / cols);
  const cellW = (width * (1 - 2 * WALL_MARGIN)) / cols;
  const cellD = (depth * (1 - 2 * WALL_MARGIN)) / rows;
  const halfCell = Math.min(cellW, cellD) / 2;
  const maxRadius = Math.min(halfCell, height * MAX_HEIGHT_FRACTION);
  const wallHeight = wallHeightFor(extent);
  const left = origin.x - width / 2 + width * WALL_MARGIN;
  const back = origin.z - depth / 2 + depth * WALL_MARGIN;

  return sorted.map((entity, i) => {
    const id = entity.entityId;
    const isBoss = isBossSized(entity.type, isBossRoom);
    const radius = Math.min(monsterRadius(wallHeight, isBoss, severityScale(entity.severity)), maxRadius);
    const slack = halfCell - radius;
    const centerX = left + cellW * ((i % cols) + 0.5);
    const centerZ = back + cellD * (Math.floor(i / cols) + 0.5);
    return {
      entityId: id,
      type: entity.type,
      severity: entity.severity,
      x: centerX + (hash01(id, 1) * 2 - 1) * slack,
      y: origin.y + radius + (height - 2 * radius) * (0.35 + 0.3 * hash01(id, 3)),
      z: centerZ + (hash01(id, 2) * 2 - 1) * slack,
      radius,
      intensity: SEVERITY_VISUAL[entity.severity].intensity,
      seed: hash01(id, 0),
    };
  });
}
