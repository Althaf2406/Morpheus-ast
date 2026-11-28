import type { CSSProperties } from "react";

// --- Styles (same shape as the "?" ReplayButton) ---
const BUTTON: CSSProperties = {
  width: 28, height: 28, padding: 0, fontFamily: "monospace", fontSize: "0.85rem",
  color: "#00e5ff", background: "rgba(13, 17, 23, 0.92)", border: "1px solid #00e5ff",
  borderRadius: 4, cursor: "pointer",
};
const MUTED: CSSProperties = { ...BUTTON, opacity: 0.55, textDecoration: "line-through" };

// --- Component ---
interface Props {
  readonly muted: boolean;
  readonly onToggle: () => void;
}

/** Mute button placed beside the "?" button; state comes from useAudioEngine. */
export function MuteToggle({ muted, onToggle }: Props) {
  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      style={muted ? MUTED : BUTTON}
      onClick={onToggle}
    >
      ♪
    </button>
  );
}
