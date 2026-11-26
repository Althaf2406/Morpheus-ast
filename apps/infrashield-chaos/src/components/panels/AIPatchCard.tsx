import type { SREDashboardData } from "../../adapter.ts";
import { patchLabel } from "./patchLabel";
import { PatchSplices } from "./PatchSplices.tsx";
import { useRevealCount } from "./useRevealCount.ts";
// --- Types ---

interface Props {
  readonly lastPatch: SREDashboardData["lastPatch"];
}

// --- Styles ---

const CARD: React.CSSProperties = {
  padding:    "12px 14px",
  fontFamily: "monospace",
};

const HEADER: React.CSSProperties = {
  fontSize:      "0.65rem",
  color:         "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom:  8,
};

const DIM: React.CSSProperties = { color: "#8b949e", fontSize: "0.72rem" };
const BADGE: React.CSSProperties = {
  display:       "inline-block",
  fontSize:      "0.62rem",
  fontWeight:    600,
  letterSpacing: "0.05em",
  borderRadius:  3,
  padding:       "2px 6px",
  marginBottom:  8,
};
const BADGE_DETERMINISTIC: React.CSSProperties = {
  ...BADGE,
  color:      "#00e5ff",
  border:     "1px solid #00e5ff",
  background: "rgba(0, 229, 255, 0.1)",
};
const BADGE_AI: React.CSSProperties = {
  ...BADGE,
  color:      "#ffaa00",
  border:     "1px solid #ffaa00",
  background: "rgba(255, 170, 0, 0.1)",
};

// --- Component ---
export function AIPatchCard({ lastPatch }: Props) {
  const splices = lastPatch?.suggestedSplices ?? [];
  const total = splices.reduce((sum, splice) => sum + splice.replacement.length, 0);
  const revealed = useRevealCount(total, lastPatch?.mutationId ?? "");
  if (lastPatch === null) {
    return (
      <div style={CARD}>
        <div style={HEADER}>AI Patch</div>
        <div style={DIM}>— Awaiting AI patch —</div>
      </div>
    );
  }
  const confidencePct = Math.round(lastPatch.confidence * 100);
  const label = patchLabel(lastPatch);
  return (
    <div style={CARD}>
      <div style={HEADER}>AI Patch</div>
      <div style={label.isDeterministic ? BADGE_DETERMINISTIC : BADGE_AI}>{label.text}</div>
      <div style={{ fontSize: "0.72rem", color: "#c9d1d9", lineHeight: 1.4 }}>{lastPatch.rationale}</div>
      <PatchSplices splices={lastPatch.suggestedSplices} revealed={revealed} />
      <div style={{ marginTop: 8, fontSize: "0.72rem" }}>
        <span style={{ color: "#8b949e" }}>Confidence: </span>
        <span style={{ color: confidencePct >= 80 ? "#3fb950" : "#ffaa00", fontWeight: 600 }}>
          {confidencePct}%
        </span>
      </div>
    </div>
  );
}
