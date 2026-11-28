import type { CSSProperties } from "react";
import type { CyberCityLayout } from "../../adapter.ts";

// --- Styles ---
const NOTICES: CSSProperties = {
  position: "absolute", top: 16, right: 16, display: "flex", flexDirection: "column", gap: 6,
  padding: "8px 12px", background: "rgba(13, 17, 23, 0.92)", border: "1px solid #30363d",
  borderRadius: 6, fontFamily: "monospace", fontSize: "0.75rem", maxWidth: 320,
};

// --- Component ---
/** Plain messages for an otherwise empty-looking city (no findings, no call edges). */
export function CityNotices({ layout }: { readonly layout: CyberCityLayout }) {
  const healthy = layout.securityFindings.length === 0;
  const noEdges = layout.edges.length === 0;
  if (!healthy && !noEdges) return null;
  return (
    <div role="status" style={NOTICES}>
      {healthy && <div style={{ color: "#3fb950" }}>✓ No findings, city is healthy</div>}
      {noEdges && <div style={{ color: "#8b949e" }}>No call edges were found between functions, so there are no roads.</div>}
    </div>
  );
}
