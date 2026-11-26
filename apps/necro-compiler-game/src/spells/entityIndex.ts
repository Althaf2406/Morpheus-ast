import type { DungeonEntity, DungeonLayout, DungeonRoom } from "../adapter.ts";

export interface EntityTarget {
  readonly entity: DungeonEntity;
  readonly room: DungeonRoom;
}

/** Looks up a monster and the room it lives in by entityId. */
export function indexEntities(layout: DungeonLayout): ReadonlyMap<string, EntityTarget> {
  const index = new Map<string, EntityTarget>();
  for (const room of layout.rooms) {
    for (const entity of room.entities) index.set(entity.entityId, { entity, room });
  }
  return index;
}
