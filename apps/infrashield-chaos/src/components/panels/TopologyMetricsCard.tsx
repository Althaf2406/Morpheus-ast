import type { SREDashboardData } from "../../adapter.ts";

// --- Types ---

type Props = Pick<
  SREDashboardData,
  "totalFunctions" | "totalEdges" | "totalCircularDeps" | "avgComplexity" | "maxComplexity"
>;

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

const ROW: React.CSSProperties = {
  display:        "flex",
  justifyContent: "space-between",
  alignItems:     "center",
  marginBottom:   5,
  fontSize:       "0.78rem",
};

const DIM: React.CSSProperties  = { color: "#8b949e" };
const BRIGHT: React.CSSProperties = { color: "#e6edf3", fontWeight: 600 };
const AMBER: React.CSSProperties  = { color: "#ffaa00", fontWeight: 600 };
const GREEN: React.CSSProperties  = { color: "#3fb950", fontWeight: 600 };

// --- Component ---

export function TopologyMetricsCard({
  totalFunctions,
  totalEdges,
  totalCircularDeps,
  avgComplexity,
  maxComplexity,
}: Props) {
  const circStyle = totalCircularDeps > 0 ? AMBER : GREEN;

  return (
    <div style={CARD}>
      <div style={HEADER}>Topology</div>

      <div style={ROW}>
        <span style={DIM}>Functions</span>
        <span style={BRIGHT}>{totalFunctions}</span>
      </div>

      <div style={ROW}>
        <span style={DIM}>Edges</span>
        <span style={BRIGHT}>{totalEdges}</span>
      </div>

      <div style={ROW}>
        <span style={DIM}>Circular Deps</span>
        <span style={circStyle}>{totalCircularDeps}</span>
      </div>

      <div style={ROW}>
        <span style={DIM}>Avg Complexity</span>
        <span style={BRIGHT}>{avgComplexity.toFixed(1)}</span>
      </div>

      <div style={ROW}>
        <span style={DIM}>Max Complexity</span>
        <span style={BRIGHT}>{maxComplexity}</span>
      </div>
    </div>
  );
}
