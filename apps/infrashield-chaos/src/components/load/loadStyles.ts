import type { CSSProperties } from "react";

// --- Styles (terminal-style SRE panel, matches panels/*) ---

export const BACKDROP: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(1,4,9,0.72)", zIndex: 100,
  display: "flex", alignItems: "center", justifyContent: "center",
};

export const DIALOG: CSSProperties = {
  width: "min(560px, 92vw)", maxHeight: "86vh", overflowY: "auto",
  background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
  fontFamily: "monospace", color: "#c9d1d9", padding: "14px 16px",
};

export const TITLE: CSSProperties = {
  fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em",
  color: "#8b949e", margin: "0 0 10px",
};

export const LABEL: CSSProperties = {
  display: "block", fontSize: "0.65rem", color: "#8b949e",
  textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 4px",
};

export const FIELD: CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "#010409", color: "#e6edf3",
  border: "1px solid #30363d", borderRadius: 4, padding: "6px 8px",
  fontFamily: "monospace", fontSize: "0.78rem",
};

export const TABLIST: CSSProperties = {
  display: "flex", gap: 4, borderBottom: "1px solid #21262d", marginBottom: 6,
};

export function tabStyle(selected: boolean): CSSProperties {
  return {
    background: "transparent", cursor: "pointer", fontFamily: "monospace",
    fontSize: "0.75rem", padding: "6px 10px", border: "none",
    color: selected ? "#00e5ff" : "#8b949e",
    borderBottom: selected ? "2px solid #00e5ff" : "2px solid transparent",
  };
}

export function buttonStyle(disabled: boolean): CSSProperties {
  return {
    marginTop: 12, padding: "6px 14px", fontFamily: "monospace", fontSize: "0.78rem",
    background: "#161b22", color: disabled ? "#8b949e" : "#00e5ff",
    border: "1px solid #30363d", borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

export const ERROR: CSSProperties = { marginTop: 10, fontSize: "0.75rem", color: "#ff4444" };

export const ROW: CSSProperties = { fontSize: "0.78rem", margin: "4px 0" };

export const MUTED: CSSProperties = { color: "#8b949e" };
