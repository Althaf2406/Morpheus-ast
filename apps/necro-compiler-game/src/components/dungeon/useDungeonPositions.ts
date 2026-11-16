import { useMemo } from "react";
import * as THREE from "three";
import type { DungeonRoom, DungeonCorridor } from "../../adapter.ts";
import { computeForceLayout } from "../../layout/forceLayout.ts";

export function useDungeonPositions(
  rooms: readonly DungeonRoom[],
  corridors: readonly DungeonCorridor[]
): ReadonlyMap<string, THREE.Vector3> {
  return useMemo(
    () => computeForceLayout(rooms, corridors).positions,
    [rooms, corridors]
  );
}
