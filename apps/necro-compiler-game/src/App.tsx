import { mockDungeonLayout } from "./mock/dungeonLayout.ts";
import { DungeonScene } from "./components/dungeon/DungeonScene.tsx";

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <DungeonScene layout={mockDungeonLayout} />
    </div>
  );
}
