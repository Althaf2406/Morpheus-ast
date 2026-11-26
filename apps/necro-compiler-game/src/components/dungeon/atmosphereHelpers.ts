import type * as THREE from "three";
import type { DungeonLayout, DungeonRoom } from "../../adapter.ts";
import { ROOM_SCALE } from "./DungeonRooms.tsx";
import type { EmberBounds } from "./emberField.ts";
import { bossRoomsOf } from "./torchAllocation.ts";
import type { TorchRoom } from "./torches.ts";

export function bossTorchRooms(layout: DungeonLayout, positions: ReadonlyMap<string, THREE.Vector3>): TorchRoom[] {
  return bossRoomsOf(layout).flatMap((room) => {
    const origin = positions.get(room.id);
    return origin == null ? [] : [{ id: room.id, origin, extent: ROOM_SCALE[room.size] }];
  });
}

/** Box enclosing every room footprint, from the floor to the tallest wall. */
export function dungeonBounds(rooms: readonly DungeonRoom[], positions: ReadonlyMap<string, THREE.Vector3>): EmberBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const room of rooms) {
    const origin = positions.get(room.id);
    if (origin == null) continue;
    const [sx, sy, sz] = ROOM_SCALE[room.size];
    min[0] = Math.min(min[0], origin.x - sx / 2);
    min[1] = Math.min(min[1], origin.y);
    min[2] = Math.min(min[2], origin.z - sz / 2);
    max[0] = Math.max(max[0], origin.x + sx / 2);
    max[1] = Math.max(max[1], origin.y + sy);
    max[2] = Math.max(max[2], origin.z + sz / 2);
  }
  return min[0] === Infinity ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max };
}
