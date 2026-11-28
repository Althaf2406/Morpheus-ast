import { useMemo, useState } from "react";
import type { DungeonLayout, NecroCompilerAdapter } from "./adapter.ts";
import { useAudioEngine } from "./audio";
import { DungeonScene } from "./components/dungeon/DungeonScene.tsx";
import type { PickHit } from "./components/dungeon/monsterPicker.ts";
import { useAdapterLoader } from "./engine/useAdapterLoader.ts";
import { useRepoParam } from "./engine/useRepoParam.ts";
import { useRepository } from "./engine/useRepository.ts";
import { LayoutNotices } from "./hud/load/LayoutNotices.tsx";
import { LoadDialog } from "./hud/load/LoadDialog.tsx";
import { RepoControls } from "./hud/load/RepoControls.tsx";
import { useLayoutRefresh } from "./engine/useLayoutRefresh.ts";
import { ErrorPanel } from "./hud/ErrorPanel.tsx";
import { CounterBar } from "./hud/CounterBar.tsx";
import { countMonsters, totalMonsters } from "./hud/counters.ts";
import { ErrorToast } from "./hud/ErrorToast.tsx";
import { Grimoire } from "./hud/Grimoire.tsx";
import { HudTitle } from "./hud/HudTitle.tsx";
import { InspectorDock } from "./hud/inspector/InspectorDock.tsx";
import { useInspectorOpen } from "./hud/inspector/useInspectorOpen.ts";
import { LoadingScreen } from "./hud/LoadingScreen.tsx";
import { MonsterTooltip } from "./hud/MonsterTooltip.tsx";
import { paletteStyle } from "./hud/palette.ts";
import { SpellBar } from "./hud/SpellBar.tsx";
import { TourChrome } from "./tour/TourChrome.tsx";
import { visualStateOf } from "./spells/spellState.ts";
import { useSpellGame } from "./spells/useSpellGame.ts";

const GOAL_LINE = "Exorcise code smells. Every spell edits real code.";

interface DungeonProps {
  readonly adapter: NecroCompilerAdapter;
  readonly initialLayout: DungeonLayout;
}

interface RepoProps extends DungeonProps {
  readonly loaded: boolean;
  readonly onOpenLoad: () => void;
  readonly onBackToSample: () => void;
}

/** The game: the real adapter is the spell caster, and the layout follows the real code. */
function Dungeon({ adapter, initialLayout, loaded, onOpenLoad, onBackToSample }: RepoProps) {
  const [layout, setLayout] = useState(initialLayout);
  const game = useSpellGame(layout, adapter);
  const { state, selected } = game;
  useLayoutRefresh(adapter, setLayout, state.pending, state.error);
  const inspector = useInspectorOpen();
  // Re-read when a spell is cast or undone, or the layout is refreshed.
  const telemetry = useMemo(
    () => (inspector.open ? adapter.getTelemetry() : null),
    [adapter, inspector.open, state.history, state.pending, layout]
  );
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
      <RepoControls loaded={loaded} onOpenLoad={onOpenLoad} onBackToSample={onBackToSample} />
      <LayoutNotices layout={layout} />
      <InspectorDock open={inspector.open} telemetry={telemetry} onToggle={inspector.toggle} />
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

/** Owns the active repository; the dungeon is keyed so every switch resets selection, history and inspector. */
function Game({ adapter, initialLayout }: DungeonProps) {
  const repo = useRepository(adapter, initialLayout);
  const param = useRepoParam(adapter, repo);
  // A valid ?repo= opens the dialog on the GitHub tab and loads it once; closing ends the link flow.
  const [fromLink, setFromLink] = useState(param.initialRepo !== null);
  const [dialogOpen, setDialogOpen] = useState(param.initialRepo !== null);
  const [formatError, setFormatError] = useState(param.formatError);
  const close = (): void => {
    setDialogOpen(false);
    setFromLink(false);
  };
  return (
    <>
      <Dungeon
        key={repo.version}
        adapter={adapter}
        initialLayout={repo.layout}
        loaded={repo.loaded}
        onOpenLoad={() => setDialogOpen(true)}
        onBackToSample={() => void param.backToSample()}
      />
      {formatError !== null && (
        <div className="hud-panel hud-toast" role="alert">
          <span>{formatError}</span>
          <button type="button" className="hud-close" aria-label="Dismiss error" onClick={() => setFormatError(null)}>
            ×
          </button>
        </div>
      )}
      {dialogOpen && (
        <LoadDialog
          onLoad={param.load}
          onLoadGitHub={param.loadGitHub}
          onClose={close}
          initialTab={fromLink ? "github" : undefined}
          initialRepo={fromLink && param.initialRepo !== null ? param.initialRepo : undefined}
          autoStart={fromLink}
        />
      )}
      <TourChrome hasRepoParam={param.initialRepo !== null} loadSummaryOpen={dialogOpen} />
    </>
  );
}

export default function App() {
  useAudioEngine();
  const { state, retry } = useAdapterLoader();
  switch (state.status) {
    case "loading":
      return <LoadingScreen />;
    case "error":
      return <ErrorPanel message={state.message} onRetry={retry} />;
    case "ready":
      return <Game adapter={state.adapter} initialLayout={state.layout} />;
  }
}
