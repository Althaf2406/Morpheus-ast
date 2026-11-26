import * as THREE from "three";
import type { DungeonLayout } from "../adapter.ts";
import { bossTorchRooms, dungeonBounds } from "../components/dungeon/atmosphereHelpers.ts";
import { buildCorridorLines } from "../components/dungeon/DungeonCorridors.tsx";
import { buildRoomMeshes, ROOM_SCALE } from "../components/dungeon/DungeonRooms.tsx";
import { createEmberField, type EmberField } from "../components/dungeon/emberField.ts";
import { buildMonsterBatches, type MonsterBatch } from "../components/dungeon/entityMeshes.ts";
import { createTorches, type Torches } from "../components/dungeon/torches.ts";
import { placeRoomEntities } from "../entities/entityPlacement.ts";
import { computeForceLayout } from "../layout/forceLayout.ts";

// --- Result shape ---
export interface PerfScene {
  readonly scene:     THREE.Scene;
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
  readonly batches:   readonly MonsterBatch[];
  readonly torches:   Torches;
  readonly embers:    EmberField;
  /** Releases every resource created by the builder. */
  dispose(): void;
}

// --- Builder: no React, no renderer, no composer ---
export function buildPerfScene(layout: DungeonLayout, reducedMotion = false): PerfScene {
  const scene = new THREE.Scene();
  const positions = computeForceLayout(layout.rooms, layout.corridors).positions;
  const disposeRooms = buildRoomMeshes(layout.rooms, positions, scene);
  const disposeCorridors = buildCorridorLines(layout.corridors, layout.rooms, positions, scene);

  const placed = layout.rooms.flatMap((room) => {
    const origin = positions.get(room.id);
    return origin == null ? [] : placeRoomEntities(room.entities, origin, ROOM_SCALE[room.size], room.size === "BOSS");
  });
  const batches = buildMonsterBatches(placed);
  batches.forEach((batch) => scene.add(batch.mesh));

  const torches = createTorches(scene, bossTorchRooms(layout, positions), reducedMotion);
  const embers = createEmberField(scene, dungeonBounds(layout.rooms, positions));

  return {
    scene,
    positions,
    batches,
    torches,
    embers,
    dispose() {
      embers.dispose();
      torches.dispose();
      batches.forEach((batch) => {
        scene.remove(batch.mesh);
        batch.dispose();
      });
      disposeCorridors?.();
      disposeRooms();
    },
  };
}
