import type { CSSProperties } from "react";

// --- Styles ---
const SCREEN: CSSProperties = {
  display:        "flex",
  flexDirection:  "column",
  alignItems:     "center",
  justifyContent: "center",
  gap:            12,
  width:          "100vw",
  height:         "100vh",
  background:     "#010409",
  color:          "#00e5ff",
  fontFamily:     "monospace",
};

const MESSAGE: CSSProperties = {
  fontSize:      "0.9rem",
  letterSpacing: "0.08em",
};

const HINT: CSSProperties = { fontSize: "0.72rem", color: "#8b949e" };

const INDICATOR_BASE: CSSProperties = {
  width:        10,
  height:       10,
  borderRadius: "50%",
  background:   "#ffaa00",
};

// --- Animation ---
const PULSE_KEYFRAMES =
  "@keyframes infrashield-loading-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// --- Component ---
export function LoadingScreen() {
  const reducedMotion = prefersReducedMotion();
  const indicator: CSSProperties = reducedMotion
    ? INDICATOR_BASE
    : { ...INDICATOR_BASE, animation: "infrashield-loading-pulse 1.2s ease-in-out infinite" };

  return (
    <div style={SCREEN} role="status" aria-live="polite">
      {!reducedMotion && <style>{PULSE_KEYFRAMES}</style>}
      <div style={indicator} aria-hidden="true" />
      <div style={MESSAGE}>Loading topology graph...</div>
      <div style={HINT}>Parsing sample repository</div>
    </div>
  );
}
