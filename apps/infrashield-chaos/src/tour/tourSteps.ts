export interface TourStep {
  readonly title: string;
  readonly text: string;
  readonly targetSelector: string;
}

export const TOUR_STEPS: readonly [TourStep, TourStep, TourStep] = [
  {
    title: "Inject a fault",
    text: "Pick a fault type in the toolbar, then press Inject Fault to break a service in the city.",
    targetSelector: '[data-tour="fault-toolbar"]',
  },
  {
    title: "Read the blast radius",
    text: "Read the blast radius in the dashboard, then apply or roll back the deterministic patch.",
    targetSelector: '[data-tour="sre-panel"]',
  },
  {
    title: "Load your own code",
    text: "Load your code and press Generate Bugfix Spec. Press I to open the Inspector.",
    targetSelector: '[data-tour="load-controls"]',
  },
];
