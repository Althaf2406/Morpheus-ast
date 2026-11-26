/** Checks the WCAG AA contrast (4.5:1) of every text/background pair used in the HUD. */
import { describe, it, expect } from "vitest";
import { PALETTE } from "../palette.ts";

const channel = (value: number): number => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const PAIRS: readonly (readonly [string, string, string])[] = [
  ["bone on panel", PALETTE.bone, PALETTE.panel],
  ["gold on panel", PALETTE.gold, PALETTE.panel],
  ["violet on panel", PALETTE.violet, PALETTE.panel],
  ["bloodText on panel", PALETTE.bloodText, PALETTE.panel],
  ["added on panel", PALETTE.added, PALETTE.panel],
  ["bone on blood (Cast button)", PALETTE.bone, PALETTE.blood],
  ["ink on gold", PALETTE.ink, PALETTE.gold],
];

describe("HUD palette", () => {
  it.each(PAIRS)("%s meets WCAG AA", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
