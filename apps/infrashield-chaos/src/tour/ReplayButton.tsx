import type { CSSProperties } from "react";

// --- Styles ---
const BUTTON: CSSProperties = {
  width: 28, height: 28, padding: 0, fontFamily: "monospace", fontSize: "0.85rem",
  color: "#00e5ff", background: "rgba(13, 17, 23, 0.92)", border: "1px solid #00e5ff",
  borderRadius: 4, cursor: "pointer",
};

// --- Component ---
interface Props {
  readonly onReplay: () => void;
}

/** "?" button that restarts the tour from step 1. */
export function ReplayButton({ onReplay }: Props) {
  return (
    <button type="button" aria-label="Replay tour" style={BUTTON} onClick={onReplay}>?</button>
  );
}
