import type { SREDashboardData } from "../../adapter.ts";
import { BlastRadiusCard }       from "./BlastRadiusCard.tsx";
import { TopologyMetricsCard }   from "./TopologyMetricsCard.tsx";
import { SecurityFindingsCard }  from "./SecurityFindingsCard.tsx";
import type { Finding }          from "./SecurityFindingsCard.tsx";
import { AIPatchCard }           from "./AIPatchCard.tsx";

// --- Types ---

interface Props {
  readonly dashboard:  SREDashboardData;
  readonly findings:   readonly Finding[];
  readonly isVisible:  boolean;
}

// --- Styles ---

const PANEL: React.CSSProperties = {
  position:        "fixed",
  top:             0,
  right:           0,
  height:          "100vh",
  width:           320,
  background:      "rgba(13, 17, 23, 0.92)",
  backdropFilter:  "blur(6px)",
  borderLeft:      "1px solid #30363d",
  overflowY:       "auto",
  display:         "flex",
  flexDirection:   "column",
  zIndex:          10,
};

const HEADER: React.CSSProperties = {
  fontFamily:    "monospace",
  fontSize:      "0.75rem",
  color:         "#58a6ff",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding:       "14px 14px 10px",
  borderBottom:  "1px solid #30363d",
  flexShrink:    0,
};

const DIVIDER: React.CSSProperties = {
  height:     1,
  background: "#21262d",
  flexShrink: 0,
};

// --- Component ---

export function SREDashboardPanel({ dashboard, findings, isVisible }: Props) {
  if (!isVisible) return null;

  return (
    <div style={PANEL}>
      <div style={HEADER}>⬡ SRE Dashboard</div>

      <TopologyMetricsCard
        totalFunctions={dashboard.totalFunctions}
        totalEdges={dashboard.totalEdges}
        totalCircularDeps={dashboard.totalCircularDeps}
        avgComplexity={dashboard.avgComplexity}
        maxComplexity={dashboard.maxComplexity}
      />

      <div style={DIVIDER} />

      <BlastRadiusCard
        blastRadiusScore={dashboard.lastFault?.blastRadiusScore ?? 0}
        lastFault={dashboard.lastFault}
      />

      <div style={DIVIDER} />

      <SecurityFindingsCard findings={findings} />

      <div style={DIVIDER} />

      <AIPatchCard lastPatch={dashboard.lastPatch} />
    </div>
  );
}
