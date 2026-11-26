import { useRef } from "react";
import type * as THREE from "three";
import type { DungeonRoom, DungeonCorridor } from "../adapter.ts";
import { computeForceLayout } from "./forceLayout.ts";

// --- Types ---

interface PositionCache {
  readonly ids: ReadonlySet<string>;
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
}

// --- Helpers ---

function hasSameMembers(cached: ReadonlySet<string>, next: ReadonlySet<string>): boolean {
  if (cached.size !== next.size) return false;
  for (const id of next) {
    if (!cached.has(id)) return false;
  }
  return true;
}

// --- Main export ---

export function useStableRoomPositions(
  rooms: readonly DungeonRoom[],
  corridors: readonly DungeonCorridor[]
): ReadonlyMap<string, THREE.Vector3> {
  const cache = useRef<PositionCache | null>(null);
  const ids = new Set(rooms.map((room) => room.id));

  const cached = cache.current;
  if (cached !== null && hasSameMembers(cached.ids, ids)) {
    return cached.positions;
  }

  const computed = computeForceLayout(rooms, corridors).positions;
  const merged = new Map<string, THREE.Vector3>();
  for (const [id, position] of computed) {
    merged.set(id, cached?.positions.get(id) ?? position);
  }

  cache.current = { ids, positions: merged };
  return merged;
}
