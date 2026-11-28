import type { DungeonLayout } from "../../adapter.ts";
import type { SpellCaster, SpellRequest, SpellResult } from "../spellCaster.ts";

const spell = { splices: [] } as unknown as SpellRequest;
const result = { mutationId: "m1", filePath: "a.ts", splicesApplied: 1 } as unknown as SpellResult;

const entity = (entityId: string, suggestedSpell: SpellRequest | null) => ({
  entityId,
  findingId: `f-${entityId}`,
  type: "ZOMBIE_VARIABLE",
  severity: "HIGH",
  title: entityId,
  description: "",
  suggestedSpell,
});

/** One room with a curable monster ("curable") and an immune one ("immune"). */
export const layout = {
  rooms: [
    {
      id: "r1",
      functionName: "f",
      filePath: "a.ts",
      size: "SMALL",
      cyclomaticComplexity: 1,
      isCircularDep: false,
      entities: [entity("curable", spell), entity("immune", null)],
      corridorIds: [],
    },
  ],
  corridors: [],
  totalEntities: 2,
  bossRoomIds: [],
} as unknown as DungeonLayout;

export const caster = (): SpellCaster => ({
  castSpell: async () => result,
  rollbackLastSpell: async () => undefined,
});
