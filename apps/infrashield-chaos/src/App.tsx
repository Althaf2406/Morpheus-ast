import { useState } from "react";
import { CyberCityScene } from "./components/city/CyberCityScene.tsx";
import { InjectFaultButton } from "./components/city/InjectFaultButton.tsx";
import { SREDashboardPanel } from "./components/panels/SREDashboardPanel.tsx";
import { mockHealthyLayout, mockFaultedLayout } from "./mock/faultScenario.ts";
import {
  mockSecurityFindings,
  mockHealthySREDashboard,
  mockFaultedSREDashboard,
} from "./mock/sreDashboard.ts";
import type { CyberCityLayout } from "./adapter.ts";

export default function App() {
  const [layout, setLayout] = useState<CyberCityLayout>(mockHealthyLayout);
  const isFaultActive = layout.nodes.some((n) => n.isFaulted);

  const cityWidth = isFaultActive ? "calc(100vw - 320px)" : "100vw";

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <div style={{ width: cityWidth, height: "100vh" }}>
        <CyberCityScene layout={layout} />
      </div>
      <InjectFaultButton
        isActive={isFaultActive}
        onInject={() => setLayout(mockFaultedLayout)}
        onReset={() => setLayout(mockHealthyLayout)}
      />
      <SREDashboardPanel
        dashboard={isFaultActive ? mockFaultedSREDashboard : mockHealthySREDashboard}
        findings={mockSecurityFindings}
        isVisible={isFaultActive}
      />
    </div>
  );
}
