import type React from "react";

// --- Palette ---
const CYAN = "#39c5cf";
const RED = "#ff7b72";
const GREEN = "#56d364";

// --- Dock and panel ---
export const DOCK: React.CSSProperties = {
  position: "absolute", top: 96, left: 16, display: "flex", flexDirection: "column",
  alignItems: "flex-start", gap: 8, maxWidth: "calc(100vw - 352px)", fontFamily: "monospace",
};
export const TOGGLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", fontFamily: "monospace",
  fontSize: "0.75rem", color: CYAN, background: "rgba(13, 17, 23, 0.92)",
  border: `1px solid ${CYAN}`, borderRadius: 4, cursor: "pointer",
};
export const KBD: React.CSSProperties = { padding: "0 5px", border: "1px solid #30363d", borderRadius: 3, color: "#8b949e" };
export const PANEL: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10, width: 440, maxWidth: "100%",
  maxHeight: "calc(100vh - 96px - 120px)", overflow: "hidden", padding: "12px 14px",
  background: "rgba(13, 17, 23, 0.92)", border: "1px solid #30363d", borderRadius: 6, color: "#c9d1d9",
};
export const HEAD: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
export const TITLE: React.CSSProperties = { margin: 0, fontSize: "0.75rem", color: CYAN, letterSpacing: "0.1em", textTransform: "uppercase" };
export const CLOSE: React.CSSProperties = { padding: "0 8px", fontFamily: "monospace", fontSize: "1rem", color: "#8b949e", background: "transparent", border: "1px solid #30363d", borderRadius: 3, cursor: "pointer" };

// --- Facts ---
export const FACTS: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", margin: 0, fontSize: "0.72rem" };
export const FACT: React.CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
export const FACT_NAME: React.CSSProperties = { fontSize: "0.62rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.08em" };
export const FACT_VALUE: React.CSSProperties = { margin: 0, color: CYAN, overflowWrap: "anywhere" };

// --- Verification badge ---
const BADGE: React.CSSProperties = { margin: 0, padding: "6px 10px", fontSize: "0.75rem", fontWeight: 600, borderRadius: 4 };
export const BADGE_OK: React.CSSProperties = { ...BADGE, color: GREEN, border: `1px solid ${GREEN}` };
export const BADGE_BAD: React.CSSProperties = { ...BADGE, color: RED, border: `1px solid ${RED}` };

// --- Diff ---
export const DIFF_BOX: React.CSSProperties = { overflow: "auto", minHeight: 60, background: "#010409", border: "1px solid #21262d", borderRadius: 4 };
export const DIFF_EMPTY: React.CSSProperties = { margin: 8, fontSize: "0.72rem", color: "#8b949e" };
export const HUNK: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" };
export const HUNK_CAPTION: React.CSSProperties = { textAlign: "left", padding: "4px 8px", color: CYAN };
export const LINE_NO: React.CSSProperties = { width: "2.5em", padding: "0 6px", textAlign: "right", color: "#8b949e", userSelect: "none" };
export const LINE_SIGN: React.CSSProperties = { width: "1.5em", textAlign: "center" };
export const LINE_TEXT: React.CSSProperties = { paddingRight: 8, whiteSpace: "pre" };
export const ROW: Record<"context" | "removed" | "added", React.CSSProperties> = {
  context: { color: "#c9d1d9" },
  removed: { color: RED, background: "rgba(248, 81, 73, 0.18)" },
  added: { color: GREEN, background: "rgba(86, 211, 100, 0.14)" },
};
export const SR_ONLY: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
};
