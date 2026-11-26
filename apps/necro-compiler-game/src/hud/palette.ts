import type { CSSProperties } from "react";

// --- Single source of truth for HUD and 3D highlight colours ---
export const PALETTE = {
  bone: "#e8dcc4",
  blood: "#b01818",
  /** Lighter blood for text and icons: the base blood is too dark to read on black. */
  bloodText: "#ff8a80",
  gold: "#f2c14e",
  violet: "#8a7bd8",
  /** Text on gold and bone surfaces. */
  ink: "#0b0809",
  panel: "#0a080b",
} as const;

/** CSS custom properties (--bone, --blood, ...) to put on the HUD root element. */
export const paletteStyle = Object.fromEntries(
  Object.entries(PALETTE).map(([name, value]) => [`--${name}`, value])
) as CSSProperties;
