import * as THREE from "three";
import type { DungeonRoom } from "../../adapter.ts";
import { ROOM_SCALE } from "./DungeonRooms.tsx";
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
