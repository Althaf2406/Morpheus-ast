import { CyberCityScene } from "./components/city/CyberCityScene.tsx";
import { mockCyberCityLayout } from "./mock/cityLayout.ts";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <CyberCityScene layout={mockCyberCityLayout} />
    </div>
  );
}
