import { paletteStyle } from "./palette.ts";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function LoadingScreen() {
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const textClass = reducedMotion ? "hud-loading__text" : "hud-loading__text hud-loading__text--pulse";

  return (
    <div className="hud-loading" style={paletteStyle} role="status" aria-live="polite">
      <p className={textClass}>Summoning the dungeon...</p>
    </div>
  );
}
