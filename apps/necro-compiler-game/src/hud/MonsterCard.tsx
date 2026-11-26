import type { EntityVisualState } from "../entities/entityTransition.ts";
import type { EntityTarget } from "../spells/entityIndex.ts";
import { LORE_NAME, SEVERITY_LABEL } from "./loreNames.ts";

interface Props {
  readonly target: EntityTarget | null;
  readonly visual: EntityVisualState;
}

const STATUS_LABEL: Record<EntityVisualState, string> = {
  ALIVE: "Alive",
  DYING: "Being exorcised…",
  PURIFIED: "Purified",
};

const IMMUNE_LORE =
  "This monster is immune to ordinary spells. Only a Holy Incantation can banish it, and that rite is not yet known.";

export function MonsterCard({ target, visual }: Props) {
  if (target === null) {
    return (
      <p className="hud-empty">Click a monster to inspect it. The spell edits the real code; Undo restores it.</p>
    );
  }
  const { entity, room } = target;
  return (
    <section className="hud-card" aria-label={`Selected monster: ${LORE_NAME[entity.type]}`}>
      <header className="hud-card__head">
        <h2 className="hud-title">{LORE_NAME[entity.type]}</h2>
        <span className={`hud-badge hud-badge--${entity.severity}`}>{SEVERITY_LABEL[entity.severity]}</span>
        <span className="hud-status">{STATUS_LABEL[visual]}</span>
      </header>
      <p className="hud-card__title">{entity.title}</p>
      <p className="hud-card__text">{entity.description}</p>
      {entity.suggestedSpell === null && (
        <p className="hud-hint">{IMMUNE_LORE}</p>
      )}
      <p className="hud-code">
        {room.filePath} <span aria-hidden="true">·</span> {room.functionName}()
      </p>
    </section>
  );
}
