export interface TourStep {
  readonly title: string;
  readonly text: string;
  readonly targetSelector: string;
}

export const TOUR_STEPS: readonly [TourStep, TourStep, TourStep] = [
  {
    title: "Inspect a monster",
    text: "Click a monster to inspect the code smell it embodies.",
    targetSelector: '[data-tour="monster-target"]',
  },
  {
    title: "Cast the spell",
    text: "Cast the spell with Enter to fix the smell. Undo with Cmd/Ctrl+Z.",
    targetSelector: '[data-tour="spell-bar"]',
  },
  {
    title: "Summon your own dungeon",
    text: "Load your code to summon a dungeon from your own repository. Open the Inspector with the I key.",
    targetSelector: '[data-tour="load-controls"]',
  },
];
