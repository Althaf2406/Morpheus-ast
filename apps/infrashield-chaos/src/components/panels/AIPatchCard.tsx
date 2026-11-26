import { useState, useEffect, useRef } from "react";
import type { SREDashboardData } from "../../adapter.ts";
import { patchLabel } from "./patchLabel";

// --- Types ---

interface Props {
  readonly lastPatch: SREDashboardData["lastPatch"];
}

// --- Constants ---

const CHARS_PER_TICK = 1;
const INTERVAL_MS   = Math.round(1000 / 30); // ~30 chars/s

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

const CODE_BOX: React.CSSProperties = {
  background:   "#010409",
  border:       "1px solid #21262d",
  borderRadius: 4,
  padding:      "8px 10px",
  fontSize:     "0.68rem",
  color:        "#e6edf3",
  overflowX:    "auto",
  whiteSpace:   "pre",
  maxHeight:    120,
  overflowY:    "auto",
  lineHeight:   1.5,
};

const DIM: React.CSSProperties = { color: "#8b949e", fontSize: "0.72rem" };
const BADGE: React.CSSProperties = {
  display:       "inline-block",
  fontSize:      "0.62rem",
  fontWeight:    600,
  letterSpacing: "0.05em",
  borderRadius:  3,
  padding:       "2px 6px",
  marginBottom:  8,
};
const BADGE_DETERMINISTIC: React.CSSProperties = {
  ...BADGE,
  color:      "#00e5ff",
  border:     "1px solid #00e5ff",
  background: "rgba(0, 229, 255, 0.1)",
};
const BADGE_AI: React.CSSProperties = {
  ...BADGE,
  color:      "#ffaa00",
  border:     "1px solid #ffaa00",
  background: "rgba(255, 170, 0, 0.1)",
};

// --- Component ---

export function AIPatchCard({ lastPatch }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [streaming, setStreaming]  = useState(false);
  const patchIdRef = useRef<string | null>(null);

  const fullCode = lastPatch?.suggestedSplices[0]?.replacement ?? "";

  useEffect(() => {
    if (lastPatch === null) {
      setDisplayed("");
      setStreaming(false);
      patchIdRef.current = null;
      return;
    }

    // --- Restart the stream only for a new patch ---
    if (patchIdRef.current === lastPatch.mutationId) return;
    patchIdRef.current = lastPatch.mutationId;

    setDisplayed("");
    setStreaming(true);
    let pos = 0;

    const id = setInterval(() => {
      pos += CHARS_PER_TICK;
      setDisplayed(fullCode.slice(0, pos));
      if (pos >= fullCode.length) {
        clearInterval(id);
        setStreaming(false);
      }
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [lastPatch, fullCode]);

  if (lastPatch === null) {
    return (
      <div style={CARD}>
        <div style={HEADER}>AI Patch</div>
        <div style={{ ...DIM }}>— Awaiting AI patch —</div>
      </div>
    );
  }

  const confidencePct = Math.round(lastPatch.confidence * 100);
  const label = patchLabel(lastPatch);

  return (
    <div style={CARD}>
      <div style={HEADER}>AI Patch</div>
      <div style={label.isDeterministic ? BADGE_DETERMINISTIC : BADGE_AI}>{label.text}</div>

      <div style={CODE_BOX}>
        {displayed}
        {streaming && <span style={{ animation: "blink 1s step-end infinite" }}>▌</span>}
      </div>

      <div style={{ marginTop: 8, fontSize: "0.7rem", color: "#8b949e", lineHeight: 1.4 }}>
        {lastPatch.rationale}
      </div>

      <div style={{ marginTop: 6, fontSize: "0.72rem" }}>
        <span style={{ color: "#8b949e" }}>Confidence: </span>
        <span style={{ color: confidencePct >= 80 ? "#3fb950" : "#ffaa00", fontWeight: 600 }}>
          {confidencePct}%
        </span>
      </div>
    </div>
  );
}
