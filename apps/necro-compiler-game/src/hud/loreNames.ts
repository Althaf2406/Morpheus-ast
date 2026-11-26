import type { DungeonEntity, EntityType } from "../adapter.ts";

export const LORE_NAME: Record<EntityType, string> = {
  POLTERGEIST_DEMON_BOSS: "Poltergeist Demon Lord",
  POLTERGEIST_DEMON: "Poltergeist Demon",
  ZOMBIE_VARIABLE: "Zombie Variable",
  SHADOW_LINT_GHOST: "Shadow Lint Ghost",
};

export const SEVERITY_LABEL: Record<DungeonEntity["severity"], string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
};
