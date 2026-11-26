import { useEffect } from "react";
import type * as THREE from "three";
import type { DungeonLayout, DungeonRoom } from "../../adapter.ts";
import { ROOM_SCALE } from "./DungeonRooms.tsx";
import { createEmberField, type EmberBounds } from "./emberField.ts";
import { bossRoomsOf } from "./torchAllocation.ts";
import { createTorches, type TorchRoom } from "./torches.ts";

// --- Props ---

interface Props {
  readonly layout:        DungeonLayout;
  readonly positions:     ReadonlyMap<string, THREE.Vector3>;
  readonly scene:         THREE.Scene;
  readonly reducedMotion: boolean;
  readonly onTickUpdate:  (tick: ((t: number) => void) | null) => void;
}

// --- Helpers ---

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

// --- Component ---

export function AtmosphereLayer({ layout, positions, scene, reducedMotion, onTickUpdate }: Props) {
  useEffect(() => {
    const torches = createTorches(scene, bossTorchRooms(layout, positions), reducedMotion);
    const embers = createEmberField(scene, dungeonBounds(layout.rooms, positions));
    const torchTick = torches.tick;
    if (!reducedMotion && torchTick != null) {
      onTickUpdate((time) => {
        torchTick(time);
        embers.tick(time);
      });
    } else {
      onTickUpdate(null);
    }
    return () => {
      onTickUpdate(null);
      torches.dispose();
      embers.dispose();
    };
  }, [layout, positions, scene, reducedMotion, onTickUpdate]);

  return null;
}
