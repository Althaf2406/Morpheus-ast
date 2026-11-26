import { useEffect, useRef } from "react";
import type * as THREE from "three";
import type { DungeonRoom } from "../../adapter.ts";
import { placeRoomEntities } from "../../entities/entityPlacement.ts";
import type { EntityVisualState } from "../../entities/entityTransition.ts";
import { ROOM_SCALE } from "./DungeonRooms.tsx";
import { createEntityDriver, type EntityDriver } from "./entityDriver.ts";
import { buildMonsterBatches, type MonsterBatch } from "./entityMeshes.ts";

// --- Props ---

interface Props {
  readonly rooms:         readonly DungeonRoom[];
  readonly positions:     ReadonlyMap<string, THREE.Vector3>;
  readonly scene:         THREE.Scene;
  /** Visual state per entityId; missing ids are ALIVE. TASK-NC-07 only updates this map. */
  readonly entityStates:  ReadonlyMap<string, EntityVisualState>;
  readonly reducedMotion: boolean;
  /** Receives the monster batches (for picking) once built, and an empty list on teardown. */
  readonly onBatches:     (batches: readonly MonsterBatch[]) => void;
  readonly onTickUpdate:  (tick: ((t: number) => void) | null) => void;
}

export function EntityLayer({
  rooms, positions, scene, entityStates, reducedMotion, onBatches, onTickUpdate,
}: Props) {
  const statesRef = useRef(entityStates);
  statesRef.current = entityStates;
  const driverRef = useRef<EntityDriver | null>(null);

  // --- Build meshes when the dungeon changes ---
  useEffect(() => {
    const placed = rooms.flatMap((room) => {
      const origin = positions.get(room.id);
      return origin == null ? [] : placeRoomEntities(room.entities, origin, ROOM_SCALE[room.size], room.size === "BOSS");
    });
    const batches = buildMonsterBatches(placed);
    const driver = createEntityDriver(batches, () => statesRef.current, reducedMotion);
    batches.forEach((batch) => scene.add(batch.mesh));
    driver.sync(0);
    driverRef.current = driver;
    onTickUpdate(driver.tick);
    onBatches(batches);
    return () => {
      onBatches([]);
      onTickUpdate(null);
      driverRef.current = null;
      batches.forEach((batch) => {
        scene.remove(batch.mesh);
        batch.dispose();
      });
    };
  }, [rooms, positions, scene, reducedMotion, onBatches, onTickUpdate]);

  // --- Reduced motion has no ticks: apply state changes immediately ---
  useEffect(() => {
    if (reducedMotion) driverRef.current?.sync(0);
  }, [entityStates, reducedMotion]);

  return null;
}
