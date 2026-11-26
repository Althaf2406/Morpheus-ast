import type { CyberCityLayout } from "../../adapter.ts";
// --- Finding shape (real engine result) ---
export type Finding = CyberCityLayout["securityFindings"][number];
// --- Types ---

interface Props {
  readonly findings: readonly Finding[];
}

// --- Helpers ---

export function severityColor(severity: Finding["severity"]): string {
  switch (severity) {
    case "CRITICAL": return "#ff4444";
    case "HIGH":     return "#ff8800";
    case "MEDIUM":   return "#ffcc00";
    case "LOW":      return "#44aaff";
    case "INFO":     return "#8b949e";
  }
}

const MAX_ROWS = 5;

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
  display:    "flex",
  alignItems: "baseline",
  gap:        6,
  marginBottom: 5,
  fontSize:   "0.72rem",
  color:      "#c9d1d9",
  overflow:   "hidden",
  whiteSpace: "nowrap",
};

const BADGE_BASE: React.CSSProperties = {
  fontSize:      "0.6rem",
  fontWeight:    700,
  letterSpacing: "0.06em",
  borderRadius:  2,
  padding:       "1px 4px",
  flexShrink:    0,
};

const OVERFLOW: React.CSSProperties = {
  fontSize: "0.68rem",
  color:    "#8b949e",
  marginTop: 4,
};

// --- Component ---

export function SecurityFindingsCard({ findings }: Props) {
  if (findings.length === 0) {
    return (
      <div style={CARD}>
        <div style={HEADER}>Security Findings</div>
        <div style={{ fontSize: "0.78rem", color: "#3fb950" }}>✓ No findings</div>
      </div>
    );
  }

  const visible  = findings.slice(0, MAX_ROWS);
  const overflow = findings.length - visible.length;

  return (
    <div style={CARD}>
      <div style={HEADER}>Security Findings</div>

      {visible.map((f) => {
        const color = severityColor(f.severity);
        const badge: React.CSSProperties = {
          ...BADGE_BASE,
          color,
          border: `1px solid ${color}`,
        };
        return (
          <div key={f.findingId} style={ROW}>
            <span style={badge}>{f.severity}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.title}
            </span>
            <span style={{ color: "#8b949e", flexShrink: 0 }}>
              {f.filePath}:{f.range.startLine}
            </span>
          </div>
        );
      })}

      {overflow > 0 && (
        <div style={OVERFLOW}>…+{overflow} more</div>
      )}
    </div>
  );
}
