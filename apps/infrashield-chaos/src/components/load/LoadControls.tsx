import type { CSSProperties } from "react";

// --- Styles ---
const BAR: CSSProperties = {
  position: "absolute", bottom: 16, right: 16, display: "flex", gap: 8, zIndex: 5,
  fontFamily: "monospace",
};
const BUTTON: CSSProperties = {
  padding: "6px 12px", background: "rgba(13, 17, 23, 0.92)", color: "#58a6ff",
  border: "1px solid #30363d", borderRadius: 4, fontFamily: "monospace",
  fontSize: "0.75rem", cursor: "pointer",
};

// --- Component ---
interface Props {
  readonly isLoaded: boolean;
  readonly onOpen: () => void;
  readonly onBack: () => void;
}

/** "Load your code" always; "Back to sample repository" only while a loaded repository is active. */
export function LoadControls({ isLoaded, onOpen, onBack }: Props) {
  return (
    <div role="toolbar" aria-label="Repository controls" style={BAR}>
      {isLoaded && <button type="button" style={BUTTON} onClick={onBack}>Back to sample repository</button>}
      <button type="button" style={BUTTON} onClick={onOpen}>Load your code</button>
    </div>
  );
}
