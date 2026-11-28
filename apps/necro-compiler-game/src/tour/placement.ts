import type { TargetRect } from "./useTargetRect";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}
export interface CardSize {
  readonly width: number;
  readonly height: number;
}
export interface CardPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** True when the card is centered and a full-screen dim replaces the spotlight. */
  readonly centered: boolean;
}

export const CARD_MARGIN = 16;
export const CARD_GAP = 12;
/** Targets covering more than this share of the viewport area get no spotlight. */
export const LARGE_TARGET_RATIO = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Computes a card position that keeps the whole card inside the viewport with a 16px margin. */
export function placeCard(target: TargetRect | null, viewport: Viewport, card: CardSize): CardPlacement {
  const width = Math.max(0, Math.min(card.width, viewport.width - CARD_MARGIN * 2));
  const height = Math.max(0, Math.min(card.height, viewport.height - CARD_MARGIN * 2));
  const maxLeft = Math.max(CARD_MARGIN, viewport.width - width - CARD_MARGIN);
  const maxTop = Math.max(CARD_MARGIN, viewport.height - height - CARD_MARGIN);
  const centeredPlacement: CardPlacement = {
    left: clamp((viewport.width - width) / 2, CARD_MARGIN, maxLeft),
    top: clamp((viewport.height - height) / 2, CARD_MARGIN, maxTop),
    width,
    height,
    centered: true,
  };
  if (target === null) return centeredPlacement;

  const areaRatio = (target.width * target.height) / (viewport.width * viewport.height);
  if (areaRatio > LARGE_TARGET_RATIO) return centeredPlacement;

  const left = clamp(target.left, CARD_MARGIN, maxLeft);
  const belowTop = target.top + target.height + CARD_GAP;
  if (belowTop <= maxTop) return { left, top: Math.max(belowTop, CARD_MARGIN), width, height, centered: false };
  const aboveTop = target.top - CARD_GAP - height;
  if (aboveTop >= CARD_MARGIN && aboveTop <= maxTop) return { left, top: aboveTop, width, height, centered: false };
  return centeredPlacement;
}
