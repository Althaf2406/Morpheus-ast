import type { DungeonLayout, DungeonRoom } from "../../adapter.ts";
import type { Extent } from "../../entities/entityPlacement.ts";
import { scaleFor, wallHeightFor } from "../../entities/scale.ts";
import type { Origin } from "./roomParts.ts";

// --- Types ---

export type TorchCorner = "BACK_LEFT" | "BACK_RIGHT" | "FRONT_LEFT" | "FRONT_RIGHT";

export interface TorchSlot {
  readonly roomId: string;
  readonly corner: TorchCorner;
  readonly lit: boolean;
}

export type TorchPositions = Readonly<Record<TorchCorner, Origin>>;

// --- Constants ---

/** Maximum number of real PointLight objects in the whole scene. */
export const LIGHT_BUDGET = 4;
const CORNERS: readonly TorchCorner[] = ["BACK_LEFT", "BACK_RIGHT", "FRONT_LEFT", "FRONT_RIGHT"];
/** Flame height as a fraction of Wall_Height. */
const TORCH_HEIGHT_FRACTION = 0.75;
const FLICKER_AMPLITUDE = 0.25;
const FLICKER_BASE_PERIOD = 2.4;
const FLICKER_PERIOD_SPREAD = 0.8;
const FLICKER_MIN_PERIOD = 2;

// --- Boss rooms ---

export function bossRoomsOf(layout: DungeonLayout): readonly DungeonRoom[] {
  return layout.rooms.filter((room) => room.size === "BOSS");
}

// --- Allocation ---

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function isBackCorner(corner: TorchCorner): boolean {
  return corner === "BACK_LEFT" || corner === "BACK_RIGHT";
}

function isLit(roomCount: number, roomIndex: number, corner: TorchCorner): boolean {
  if (roomCount === 1) return true;
  if (roomCount === 2) return isBackCorner(corner);
  return corner === "BACK_LEFT" && roomIndex < LIGHT_BUDGET;
}

/** Deterministic: sorted by room id (code-unit order), duplicates removed, input order ignored. */
export function allocateTorches(bossRoomIds: readonly string[]): readonly TorchSlot[] {
  const ids = [...new Set(bossRoomIds)].sort(compareIds);
  return ids.flatMap((roomId, index) =>
    CORNERS.map((corner) => ({ roomId, corner, lit: isLit(ids.length, index, corner) })),
  );
}

// --- Placement ---

/** World positions of the four torch flames, inset by the pillar girth beside the corner pillars. */
export function torchCorners(origin: Origin, extent: Extent): TorchPositions {
  const wallHeight = wallHeightFor(extent);
  const inset = scaleFor(wallHeight).pillarGirth;
  const halfX = extent[0] / 2 - inset;
  const halfZ = extent[2] / 2 - inset;
  const y = origin.y + wallHeight * TORCH_HEIGHT_FRACTION;
  return {
    BACK_LEFT: { x: origin.x - halfX, y, z: origin.z - halfZ },
    BACK_RIGHT: { x: origin.x + halfX, y, z: origin.z - halfZ },
    FRONT_LEFT: { x: origin.x - halfX, y, z: origin.z + halfZ },
    FRONT_RIGHT: { x: origin.x + halfX, y, z: origin.z + halfZ },
  };
}

// --- Flicker ---

/** Multiplier in [0.75, 1.25] for a torch with seed in [0, 1]; always 1 under Reduced_Motion. */
export function flickerFactor(time: number, seed: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const period = Math.max(FLICKER_MIN_PERIOD, FLICKER_BASE_PERIOD + FLICKER_PERIOD_SPREAD * seed);
  const phase = 2 * Math.PI * seed;
  return 1 + FLICKER_AMPLITUDE * Math.sin((2 * Math.PI * time) / period + phase);
}
