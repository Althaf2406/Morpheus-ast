import type { DungeonLayout } from "../adapter.ts";
import type { EntityVisualState } from "../entities/entityTransition.ts";

export interface MonsterCounts {
  readonly aliveCount: number;
  readonly totalCount: number;
  readonly purifiedCount: number;
}

/** Total monsters across every room of a layout. */
export const totalMonsters = (layout: DungeonLayout): number =>
  layout.rooms.reduce((sum, room) => sum + room.entities.length, 0);

/** Alive and purified derived from one states map; a dying monster still counts as alive. */
export function countMonsters(totalCount: number, states: ReadonlyMap<string, EntityVisualState>): MonsterCounts {
  let purifiedCount = 0;
  for (const visual of states.values()) {
    if (visual === "PURIFIED") purifiedCount += 1;
  }
  return { aliveCount: totalCount - purifiedCount, totalCount, purifiedCount };
}
