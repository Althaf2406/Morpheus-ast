import type { PickHit } from "../components/dungeon/monsterPicker.ts";
import type { EntityTarget } from "../spells/entityIndex.ts";
import { LORE_NAME, SEVERITY_LABEL } from "./loreNames.ts";

interface Props {
  readonly hit: PickHit;
  readonly target: EntityTarget;
}

const OFFSET_PX = 16;

export function MonsterTooltip({ hit, target }: Props) {
  const { entity, room } = target;
  return (
    <div
      className="hud-panel hud-tooltip"
      role="tooltip"
      style={{ left: hit.clientX + OFFSET_PX, top: hit.clientY + OFFSET_PX }}
    >
      <strong>{LORE_NAME[entity.type]}</strong> · {SEVERITY_LABEL[entity.severity]}
      <div>{entity.title}</div>
      <div className="hud-code">{room.filePath}</div>
    </div>
  );
}
