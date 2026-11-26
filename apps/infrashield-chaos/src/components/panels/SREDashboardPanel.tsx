import { useMemo } from "react";
import type { CyberCityLayout, InfraShieldAdapter, SREDashboardData } from "../../adapter.ts";
import { BlastRadiusCard }       from "./BlastRadiusCard.tsx";
import { TopologyMetricsCard }   from "./TopologyMetricsCard.tsx";
import { SecurityFindingsCard }  from "./SecurityFindingsCard.tsx";
import { AIPatchCard }           from "./AIPatchCard.tsx";
import { BugfixSpecButton }      from "./BugfixSpecButton.tsx";
import { BugfixDownloadButton }  from "./BugfixDownloadButton.tsx";
import { PatchController }       from "./PatchController.tsx";
// --- Types ---
export type DashboardAdapter = Pick<
  InfraShieldAdapter,
  "getSREDashboard" | "generateBugfixSpec" | "generateBugfixFile"
>;
interface Props {
  readonly adapter:        DashboardAdapter;
  readonly layout:         CyberCityLayout;
  readonly patch:          SREDashboardData["lastPatch"];
  readonly isPatchApplied: boolean;
  readonly onApplyPatch:   () => void;
  readonly onRollback:     () => void;
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
export function SREDashboardPanel({
  adapter, layout, patch, isPatchApplied, onApplyPatch, onRollback,
}: Props) {
  // --- Engine snapshot (recomputed when the layout or patch changes) ---
  const dashboard = useMemo(() => adapter.getSREDashboard(), [adapter, layout, patch]);
  const fault = layout.activeFault ?? dashboard.lastFault;
  const isFaultInjected = fault !== null;
  if (!isFaultInjected && !isPatchApplied) return null;
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
      <BlastRadiusCard blastRadiusScore={fault?.blastRadiusScore ?? 0} lastFault={fault} nodes={layout.nodes} />
      <div style={DIVIDER} />
      <SecurityFindingsCard findings={layout.securityFindings} />
      <div style={DIVIDER} />
      <AIPatchCard lastPatch={patch} />
      <PatchController
        hasPatch={patch !== null}
        isPatchApplied={isPatchApplied}
        onApplyPatch={onApplyPatch}
        onRollback={onRollback}
      />
      <BugfixSpecButton adapter={adapter} isEnabled={isFaultInjected} />
      <BugfixDownloadButton adapter={adapter} isEnabled={isFaultInjected} />
    </div>
  );
}
