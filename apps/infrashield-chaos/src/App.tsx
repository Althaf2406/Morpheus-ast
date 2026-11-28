import { CyberCityScene } from "./components/city/CyberCityScene.tsx";
import { FaultToolbar } from "./components/city/FaultToolbar.tsx";
import { InspectorDock } from "./components/panels/InspectorDock.tsx";
import { SREDashboardPanel } from "./components/panels/SREDashboardPanel.tsx";
import { CityNotices } from "./components/city/CityNotices.tsx";
import { LoadControls } from "./components/load/LoadControls.tsx";
import { LoadDialog } from "./components/load/LoadDialog.tsx";
import { useRepoParam } from "./hooks/useRepoParam.ts";
import { useRepoSwitch } from "./hooks/useRepoSwitch.ts";
import { LoadingScreen } from "./hud/LoadingScreen.tsx";
import { ErrorPanel } from "./hud/ErrorPanel.tsx";
import { useAdapterLoader } from "./engine/useAdapterLoader.ts";
import { useCityController } from "./hooks/useCityController.ts";
import { useInspectorOpen } from "./hooks/useInspectorOpen.ts";
import { ReplayButton } from "./tour/ReplayButton.tsx";
import { TourChrome } from "./tour/TourChrome.tsx";
import { useTour } from "./tour/useTour.ts";
import { useEffect } from "react";
import type { CandidateFile, CyberCityLayout, InfraShieldAdapter } from "./adapter";

// --- Styles ---
const ACTION_ERROR: React.CSSProperties = {
  position: "absolute", bottom: 16, left: 16, padding: "8px 12px", maxWidth: 480,
  background: "#1a0505", color: "#ff4444", border: "1px solid #ff2222",
  fontFamily: "monospace", fontSize: "0.8rem",
};

// --- City ---
interface CityProps {
  readonly adapter: InfraShieldAdapter;
  readonly initialLayout: CyberCityLayout;
}

function City({ adapter, initialLayout }: CityProps) {
  const city = useCityController(adapter, initialLayout);
  const inspector = useInspectorOpen();
  const repo = useRepoSwitch(adapter, city.switchRepository);
  const param = useRepoParam(adapter);
  const { openDialog, closeDialog, load, loadGitHub, backToSample } = repo;
  const { pendingRepo, setParam, clearParam, consume } = param;
  useEffect(() => { if (pendingRepo !== null) openDialog(); }, [pendingRepo, openDialog]);
  const onLoad = async (candidates: readonly CandidateFile[]) => {
    const outcome = await load(candidates);
    if (outcome.ok) clearParam();
    return outcome;
  };
  const onLoadGitHub = async (ref: string) => {
    const outcome = await loadGitHub(ref);
    if (outcome.ok) setParam(ref);
    return outcome;
  };
  // A valid ?repo= opens the Load_Summary dialog from an effect, so defer from the first render.
  const hasRepoParam = pendingRepo !== null;
  const tour = useTour("infra", { hasRepoParam, loadSummaryOpen: hasRepoParam || repo.dialogOpen });
  const message = city.actionError ?? repo.error ?? param.formatError;
  const isFaultActive = city.layout.activeFault !== null;
  const isPanelOpen = isFaultActive || city.isPatchApplied;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div style={{ width: isPanelOpen ? "calc(100vw - 320px)" : "100vw", height: "100vh" }}>
        <CyberCityScene
          layout={city.layout}
          selectedId={city.selectedId}
          onSelect={city.setSelectedId}
        />
      </div>
      <FaultToolbar
        faultType={city.faultType}
        onFaultTypeChange={city.setFaultType}
        isActive={isFaultActive}
        onInject={city.inject}
        onReset={city.reset}
      />
      <LoadControls isLoaded={repo.isLoaded} onOpen={repo.openDialog} onBack={() => { backToSample(); clearParam(); }} />
      {!isPanelOpen && <CityNotices layout={city.layout} />}
      {repo.dialogOpen && (
        <LoadDialog
          onLoad={onLoad}
          onLoadGitHub={onLoadGitHub}
          onClose={() => { closeDialog(); consume(); }}
          initialTab={pendingRepo === null ? undefined : "github"}
          initialRepo={pendingRepo ?? undefined}
          autoStart={pendingRepo !== null}
        />
      )}
      <InspectorDock
        key={city.repoEpoch}
        open={inspector.open}
        telemetry={inspector.open ? adapter.getInspectorTelemetry() : null}
        onToggle={inspector.toggle}
        extra={<ReplayButton onReplay={tour.replay} />}
      />
      <TourChrome tour={tour} />
      {message !== null && (
        <div role="alert" style={ACTION_ERROR}>{message}</div>
      )}
      <SREDashboardPanel
        adapter={adapter}
        layout={city.layout}
        patch={city.patch}
        isPatchApplied={city.isPatchApplied}
        onApplyPatch={city.applyPatch}
        onRollback={city.rollback}
      />
    </div>
  );
}

// --- App ---
export default function App() {
  const { state, retry } = useAdapterLoader();
  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ErrorPanel message={state.message} onRetry={retry} />;
  return <City adapter={state.adapter} initialLayout={state.layout} />;
}
