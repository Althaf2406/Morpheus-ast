import type { Extent } from "../../entities/entityPlacement.ts";
import { scaleFor, wallHeightFor } from "../../entities/scale.ts";
// --- Types ---
/** Axis-aligned box: centre position and full size, in world units. */
export interface PartBox {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
}
export interface RoomParts {
  readonly floor:   readonly PartBox[];
  readonly walls:   readonly PartBox[];
  readonly pillars: readonly PartBox[];
  readonly runes:   readonly PartBox[];
}
export interface Origin {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
// --- Constants ---
export const FLOOR_THICKNESS = 0.18;
const DOOR_FRACTION          = 0.3;
const RUNE_THICKNESS         = 0.05;
const RUNE_WIDTH             = 0.14;
const RUNE_SPAN              = 0.7;
// --- Helpers ---
function box(x: number, y: number, z: number, sx: number, sy: number, sz: number): PartBox {
  return { x, y, z, sx, sy, sz };
}
// Wall and pillar thickness stay inside the 10% margin kept free by entity placement.
function thicknessFor(width: number, depth: number): number {
  return Math.min(0.3, Math.min(width, depth) * 0.08);
}
// --- Parts ---
function wallBoxes(o: Origin, extent: Extent, t: number): PartBox[] {
  const [w, , d] = extent;
  const wallH  = wallHeightFor(extent);
  const y      = o.y + wallH / 2;
  const gapX   = w * DOOR_FRACTION;
  const gapZ   = d * DOOR_FRACTION;
  const segX   = (w - gapX) / 2;
  const segZ   = (d - gapZ) / 2;
  const offX   = gapX / 2 + segX / 2;
  const offZ   = gapZ / 2 + segZ / 2;
  const edgeX  = w / 2 - t / 2;
  const edgeZ  = d / 2 - t / 2;
  const result: PartBox[] = [];
  for (const side of [-1, 1]) {
    for (const lane of [-1, 1]) {
      result.push(box(o.x + lane * offX, y, o.z + side * edgeZ, segX, wallH, t));
      result.push(box(o.x + side * edgeX, y, o.z + lane * offZ, t, wallH, segZ));
    }
  }
  return result;
}
function pillarBoxes(o: Origin, extent: Extent): PartBox[] {
  const [w, , d] = extent;
  const { pillarHeight: height, pillarGirth: girth } = scaleFor(wallHeightFor(extent));
  const result: PartBox[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      result.push(box(o.x + sx * (w / 2 - girth / 2), o.y + height / 2, o.z + sz * (d / 2 - girth / 2), girth, height, girth));
    }
  }
  return result;
}
function runeBoxes(o: Origin, [w, , d]: Extent): PartBox[] {
  const y  = o.y + FLOOR_THICKNESS + RUNE_THICKNESS / 2;
  const rw = w * RUNE_SPAN;
  const rd = d * RUNE_SPAN;
  return [
    box(o.x, y, o.z - rd / 2, rw, RUNE_THICKNESS, RUNE_WIDTH),
    box(o.x, y, o.z + rd / 2, rw, RUNE_THICKNESS, RUNE_WIDTH),
    box(o.x - rw / 2, y, o.z, RUNE_WIDTH, RUNE_THICKNESS, rd),
    box(o.x + rw / 2, y, o.z, RUNE_WIDTH, RUNE_THICKNESS, rd),
    box(o.x, y, o.z, rw, RUNE_THICKNESS, RUNE_WIDTH),
    box(o.x, y, o.z, RUNE_WIDTH, RUNE_THICKNESS, rd),
  ];
}
// --- Public ---
/** Open crypt room: thin floor slab, low walls with a door gap per side, corner pillars. */
export function buildRoomParts(origin: Origin, extent: Extent, isBoss: boolean): RoomParts {
  const [w, , d] = extent;
  const t = thicknessFor(w, d);
  return {
    floor:   [box(origin.x, origin.y + FLOOR_THICKNESS / 2, origin.z, w, FLOOR_THICKNESS, d)],
    walls:   wallBoxes(origin, extent, t),
    pillars: pillarBoxes(origin, extent),
    runes:   isBoss ? runeBoxes(origin, extent) : [],
  };
}
