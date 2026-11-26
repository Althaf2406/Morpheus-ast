import type { CSSProperties } from "react";

// --- Styles ---
const SCREEN: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "center",
  width:          "100vw",
  height:         "100vh",
  background:     "#010409",
  fontFamily:     "monospace",
};

const PANEL: CSSProperties = {
  maxWidth:     480,
  padding:      "16px 20px",
  background:   "#0d1117",
  border:       "1px solid #ff4444",
  borderRadius: 6,
  color:        "#e6edf3",
};

const TITLE: CSSProperties = {
  fontSize:      "0.75rem",
  color:         "#ffaa00",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom:  8,
};

const MESSAGE: CSSProperties = {
  fontSize:     "0.8rem",
  color:        "#ff4444",
  lineHeight:   1.5,
  marginBottom: 14,
  wordBreak:    "break-word",
};

const RETRY_BTN: CSSProperties = {
  padding:       "7px 16px",
  fontFamily:    "monospace",
  fontSize:      "0.75rem",
  fontWeight:    600,
  letterSpacing: "0.06em",
  color:         "#00e5ff",
  background:    "#0d2340",
  border:        "1px solid #00e5ff",
  borderRadius:  4,
  cursor:        "pointer",
};

// --- Component ---
interface Props {
  readonly message: string;
  readonly onRetry: () => void;
}

export function ErrorPanel({ message, onRetry }: Props) {
  return (
    <div style={SCREEN}>
      <div style={PANEL} role="alert">
        <div style={TITLE}>Engine failed to load</div>
        <div style={MESSAGE}>{message}</div>
        <button style={RETRY_BTN} onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}
