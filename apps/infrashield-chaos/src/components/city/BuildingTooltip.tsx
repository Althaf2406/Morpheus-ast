import type { CityNode } from "../../adapter.ts";
// --- Constants ---
const OFFSET_PX = 14;
interface Props {
  readonly node: CityNode;
  /** Pointer position in pixels relative to the scene container. */
  readonly x: number;
  readonly y: number;
}
// --- Styles ---
const boxStyle = {
  position: "absolute",
  pointerEvents: "none",
  padding: "6px 10px",
  background: "rgba(10, 14, 20, 0.92)",
  border: "1px solid #00e5ff",
  color: "#00e5ff",
  fontFamily: "monospace",
  fontSize: 12,
  lineHeight: 1.5,
  maxWidth: 320,
  wordBreak: "break-all",
} as const;
/** Function name, file, complexity and centrality of the hovered building. */
export function BuildingTooltip({ node, x, y }: Props) {
  const stateColor = node.isFaulted ? "#ff2222" : node.isAffected ? "#ffaa00" : "#00e5ff";
  return (
    <div
      role="tooltip"
      style={{ ...boxStyle, left: x + OFFSET_PX, top: y + OFFSET_PX, borderColor: stateColor }}
    >
      <div style={{ color: stateColor, fontWeight: "bold" }}>{node.name}</div>
      <div>{node.filePath}</div>
      <div>complexity: {node.complexity}</div>
      <div>centrality: {node.centralityScore.toFixed(3)}</div>
    </div>
  );
}
