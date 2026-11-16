import type React from "react";

// --- Style constants ---

export const CARD: React.CSSProperties = {
  padding:    "12px 14px",
  fontFamily: "monospace",
};

export const HEADER: React.CSSProperties = {
  fontSize:      "0.65rem",
  color:         "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom:  8,
};

const BTN_BASE: React.CSSProperties = {
  width:         "100%",
  padding:       "7px 10px",
  fontFamily:    "monospace",
  fontSize:      "0.75rem",
  fontWeight:    600,
  letterSpacing: "0.06em",
  borderRadius:  4,
  border:        "1px solid #58a6ff",
  cursor:        "pointer",
  transition:    "opacity 0.15s",
};

export const BTN_ACTIVE: React.CSSProperties = {
  ...BTN_BASE,
  background: "#0d2340",
  color:      "#58a6ff",
};

export const BTN_DISABLED: React.CSSProperties = {
  ...BTN_BASE,
  background: "#161b22",
  color:      "#484f58",
  border:     "1px solid #30363d",
  cursor:     "not-allowed",
  opacity:    0.5,
};

export const OUTPUT_BOX: React.CSSProperties = {
  background:   "#010409",
  border:       "1px solid #21262d",
  borderRadius: 4,
  padding:      "8px 10px",
  fontSize:     "0.68rem",
  color:        "#e6edf3",
  whiteSpace:   "pre",
  overflowX:    "auto",
  maxHeight:    220,
  overflowY:    "auto",
  lineHeight:   1.5,
  marginTop:    8,
};

export const COPY_BTN: React.CSSProperties = {
  marginTop:    6,
  padding:      "3px 10px",
  fontFamily:   "monospace",
  fontSize:     "0.68rem",
  color:        "#8b949e",
  background:   "transparent",
  border:       "1px solid #30363d",
  borderRadius: 3,
  cursor:       "pointer",
};

export const ERROR_BOX: React.CSSProperties = {
  marginTop:  8,
  fontSize:   "0.72rem",
  color:      "#ff4444",
  lineHeight: 1.4,
};

export const DIM: React.CSSProperties = { fontSize: "0.72rem", color: "#8b949e" };
