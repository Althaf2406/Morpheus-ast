import type { SREDashboardData } from "../../adapter.ts";

// --- Types ---

interface Props {
  readonly blastRadiusScore: number;
  readonly lastFault: SREDashboardData["lastFault"];
}

// --- Helpers ---

export function scoreToPercent(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

function barColor(score: number): string {
  if (score > 0.7) return "#ff4444";
  if (score >= 0.3) return "#ffaa00";
  return "#00e5ff";
}

// --- Styles ---

const CARD: React.CSSProperties = {
  padding:    "12px 14px",
  fontFamily: "monospace",
  color:      "#c9d1d9",
};

const LABEL: React.CSSProperties = {
  fontSize:  "0.65rem",
  color:     "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 6,
};

const META_ROW: React.CSSProperties = {
  display:        "flex",
  justifyContent: "space-between",
  fontSize:       "0.75rem",
  marginTop:      8,
};

const TRACK: React.CSSProperties = {
  height:       6,
  borderRadius: 3,
  background:   "#21262d",
  overflow:     "hidden",
};

// --- Component ---

export function BlastRadiusCard({ blastRadiusScore, lastFault }: Props) {
  if (lastFault === null) {
    return (
      <div style={CARD}>
        <div style={LABEL}>Blast Radius</div>
        <div style={{ fontSize: "0.8rem", color: "#8b949e" }}>— No active fault —</div>
      </div>
    );
  }

  const pct   = scoreToPercent(blastRadiusScore);
  const color = barColor(blastRadiusScore);

  const fill: React.CSSProperties = {
    height:       "100%",
    width:        `${pct}%`,
    background:   color,
    borderRadius: 3,
    transition:   "width 0.4s ease",
  };

  return (
    <div style={CARD}>
      <div style={LABEL}>Blast Radius</div>

      <div style={TRACK}>
        <div style={fill} />
      </div>

      <div style={META_ROW}>
        <span style={{ color }}>{pct}%</span>
        <span style={{ color: "#8b949e" }}>{lastFault.faultType}</span>
      </div>

      <div style={{ fontSize: "0.72rem", marginTop: 6, color: "#8b949e" }}>
        Target:{" "}
        <span style={{ color: "#e6edf3" }}>{lastFault.targetFunctionId}</span>
      </div>

      <div style={{ fontSize: "0.72rem", marginTop: 2, color: "#8b949e" }}>
        Affected:{" "}
        <span style={{ color: "#e6edf3" }}>{lastFault.affectedNodes.length} nodes</span>
      </div>
    </div>
  );
}
