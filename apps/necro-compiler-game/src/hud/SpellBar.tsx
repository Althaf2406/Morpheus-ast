import type { EntityVisualState } from "../entities/entityTransition.ts";
import type { EntityTarget } from "../spells/entityIndex.ts";
import type { PendingSpell } from "../spells/spellState.ts";
import { MonsterCard } from "./MonsterCard.tsx";
import { SpellButton } from "./SpellButton.tsx";

interface Props {
  readonly selected: EntityTarget | null;
  readonly visual: EntityVisualState;
  readonly pending: PendingSpell | null;
  readonly castEnabled: boolean;
  readonly undoEnabled: boolean;
  readonly onCast: () => void;
  readonly onUndo: () => void;
}

/** Bottom spell bar: selected monster plus the Cast and Undo buttons. */
export function SpellBar({ selected, visual, pending, castEnabled, undoEnabled, onCast, onUndo }: Props) {
  const noSpell = selected !== null && selected.entity.suggestedSpell === null;
  return (
    <div className="hud-panel hud-bar" role="region" aria-label="Spell bar">
      <MonsterCard target={selected} visual={visual} />
      <div className="hud-actions">
        <SpellButton
          variant="cast"
          label="Cast Refactoring Spell"
          shortcut="Enter"
          keys="Enter"
          disabled={!castEnabled}
          busy={pending?.kind === "CAST"}
          onClick={onCast}
        >
          {pending?.kind === "CAST" ? "Casting…" : "Cast Refactoring Spell"}
        </SpellButton>
        <SpellButton
          variant="undo"
          label="Undo Spell"
          shortcut="Ctrl/⌘+Z"
          keys="Control+Z Meta+Z"
          disabled={!undoEnabled}
          busy={pending?.kind === "UNDO"}
          onClick={onUndo}
        >
          {pending?.kind === "UNDO" ? "Undoing…" : "Undo Spell"}
        </SpellButton>
        {noSpell && <p className="hud-hint">No spell is known for this monster yet.</p>}
      </div>
    </div>
  );
}
