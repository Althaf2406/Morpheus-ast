import { CyberCityScene } from "./components/city/CyberCityScene.tsx";
import { FaultToolbar } from "./components/city/FaultToolbar.tsx";
import { InspectorDock } from "./components/panels/InspectorDock.tsx";
import { SREDashboardPanel } from "./components/panels/SREDashboardPanel.tsx";
import { LoadingScreen } from "./hud/LoadingScreen.tsx";
import { ErrorPanel } from "./hud/ErrorPanel.tsx";
import { useAdapterLoader } from "./engine/useAdapterLoader.ts";
import { useCityController } from "./hooks/useCityController.ts";
import { useInspectorOpen } from "./hooks/useInspectorOpen.ts";
import type { CyberCityLayout, InfraShieldAdapter } from "./adapter";

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
      <InspectorDock
        open={inspector.open}
        telemetry={inspector.open ? adapter.getInspectorTelemetry() : null}
        onToggle={inspector.toggle}
      />
      {city.actionError !== null && <div role="alert" style={ACTION_ERROR}>{city.actionError}</div>}
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
