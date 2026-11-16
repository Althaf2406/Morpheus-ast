import { useState } from "react";
import { CyberCityScene } from "./components/city/CyberCityScene.tsx";
import { InjectFaultButton } from "./components/city/InjectFaultButton.tsx";
import { mockHealthyLayout, mockFaultedLayout } from "./mock/faultScenario.ts";
import type { CyberCityLayout } from "./adapter.ts";

export default function App() {
  const [layout, setLayout] = useState<CyberCityLayout>(mockHealthyLayout);
  const isFaultActive = layout.nodes.some((n) => n.isFaulted);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <CyberCityScene layout={layout} />
      <InjectFaultButton
        isActive={isFaultActive}
        onInject={() => setLayout(mockFaultedLayout)}
        onReset={() => setLayout(mockHealthyLayout)}
      />
    </div>
  );
}
