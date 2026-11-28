import "../tour/tour.css";
import { useMuteControls } from "./useAudioEngine";

/** Mute button styled like the tour "?" button (shares its `tour-replay` class). */
export function MuteToggle() {
  const { muted, toggleMute } = useMuteControls();
  return (
    <button
      type="button"
      className="tour-replay"
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      onClick={toggleMute}
    >
      {muted ? "🔇" : "🔈"}
    </button>
  );
}
