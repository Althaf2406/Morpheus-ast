import { useMemo, useState } from "react";
import type { DungeonLayout, NecroCompilerAdapter } from "./adapter.ts";
import { DungeonScene } from "./components/dungeon/DungeonScene.tsx";
import type { PickHit } from "./components/dungeon/monsterPicker.ts";
import { useAdapterLoader } from "./engine/useAdapterLoader.ts";
import { useLayoutRefresh } from "./engine/useLayoutRefresh.ts";
import { ErrorPanel } from "./hud/ErrorPanel.tsx";
import { CounterBar } from "./hud/CounterBar.tsx";
import { countMonsters, totalMonsters } from "./hud/counters.ts";
import { ErrorToast } from "./hud/ErrorToast.tsx";
import { Grimoire } from "./hud/Grimoire.tsx";
import { HudTitle } from "./hud/HudTitle.tsx";
import { LoadingScreen } from "./hud/LoadingScreen.tsx";
import { MonsterTooltip } from "./hud/MonsterTooltip.tsx";
import { paletteStyle } from "./hud/palette.ts";
import { SpellBar } from "./hud/SpellBar.tsx";
import { visualStateOf } from "./spells/spellState.ts";
import { useSpellGame } from "./spells/useSpellGame.ts";

const GOAL_LINE = "Exorcise code smells. Every spell edits real code.";

interface DungeonProps {
  readonly adapter: NecroCompilerAdapter;
  readonly initialLayout: DungeonLayout;
}

/** The game: the real adapter is the spell caster, and the layout follows the real code. */
function Dungeon({ adapter, initialLayout }: DungeonProps) {
  const [layout, setLayout] = useState(initialLayout);
  const game = useSpellGame(layout, adapter);
  const { state, selected } = game;
  useLayoutRefresh(adapter, setLayout, state.pending, state.error);
  const [hover, setHover] = useState<PickHit | null>(null);
  const hovered = hover === null ? undefined : game.lookup.get(hover.entityId);
  const totalCount = useMemo(() => totalMonsters(initialLayout), [initialLayout]);
  const counts = countMonsters(totalCount, state.states);

  return (
    <div className="game-root" style={paletteStyle}>
      <DungeonScene
        layout={layout}
        entityStates={state.states}
        selectedEntityId={state.selectedId}
        onSelectEntity={game.select}
        onHoverEntity={setHover}
      />
      <HudTitle goalLine={GOAL_LINE}>
        <CounterBar {...counts} />
      </HudTitle>
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

export default function App() {
  const { state, retry } = useAdapterLoader();
  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "error":
      return <ErrorPanel message={state.message} onRetry={retry} />;
    case "ready":
      return <Dungeon adapter={state.adapter} initialLayout={state.layout} />;
  }
}
