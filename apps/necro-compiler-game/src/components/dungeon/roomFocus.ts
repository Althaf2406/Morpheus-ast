import * as THREE from "three";
import type { DungeonRoom } from "../../adapter.ts";
import { ROOM_SCALE } from "./DungeonRooms.tsx";
/** Half-diagonal of each room's footprint on the ground plane, keyed by room id. */
export function roomReach(rooms: readonly DungeonRoom[]): ReadonlyMap<string, number> {
  return new Map(rooms.map((room) => [room.id, Math.hypot(ROOM_SCALE[room.size][0], ROOM_SCALE[room.size][2]) / 2]));
}

/** Centre of the room containing the entity, or null when the entity or room position is unknown. */
export function roomFocusTarget(
  rooms: readonly DungeonRoom[],
  positions: ReadonlyMap<string, THREE.Vector3>,
  entityId: string
): THREE.Vector3 | null {
  const room = rooms.find((r) => r.entities.some((e) => e.entityId === entityId));
  const origin = room === undefined ? undefined : positions.get(room.id);
  if (room === undefined || origin === undefined) return null;
  return origin.clone().setY(origin.y + ROOM_SCALE[room.size][1] / 2);
}
