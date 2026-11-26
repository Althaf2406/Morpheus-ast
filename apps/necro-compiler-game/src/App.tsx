import { useState } from "react";
import { DungeonScene } from "./components/dungeon/DungeonScene.tsx";
import type { PickHit } from "./components/dungeon/monsterPicker.ts";
import { ErrorToast } from "./hud/ErrorToast.tsx";
import { Grimoire } from "./hud/Grimoire.tsx";
import { MonsterTooltip } from "./hud/MonsterTooltip.tsx";
import { paletteStyle } from "./hud/palette.ts";
import { SpellBar } from "./hud/SpellBar.tsx";
import { mockDungeonLayout } from "./mock/dungeonLayout.ts";
import { createMockSpellCaster } from "./mock/mockSpellCaster.ts";
import { useSpellGame } from "./spells/useSpellGame.ts";
import { visualStateOf } from "./spells/spellState.ts";

export default function App() {
  // The mock caster stands in until the real NecroCompilerAdapter is connected.
  const [caster] = useState(() => createMockSpellCaster());
  const game = useSpellGame(mockDungeonLayout, caster);
  const [hover, setHover] = useState<PickHit | null>(null);
  const hovered = hover === null ? undefined : game.lookup.get(hover.entityId);
  const { state, selected } = game;

  return (
    <div className="game-root" style={paletteStyle}>
      <DungeonScene
        layout={mockDungeonLayout}
        entityStates={state.states}
        selectedEntityId={state.selectedId}
        onSelectEntity={game.select}
        onHoverEntity={setHover}
      />
      {hover !== null && hovered !== undefined && <MonsterTooltip hit={hover} target={hovered} />}
      <Grimoire history={state.history} />
      <SpellBar
        selected={selected}
        visual={selected === null ? "ALIVE" : visualStateOf(state, selected.entity.entityId)}
        pending={state.pending}
        castEnabled={game.castEnabled}
        undoEnabled={game.undoEnabled}
        onCast={game.cast}
        onUndo={game.undo}
      />
      <ErrorToast message={state.error} onDismiss={game.dismissError} />
    </div>
  );
}
