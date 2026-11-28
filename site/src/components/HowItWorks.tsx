import type { ReactElement } from "react";

interface Step {
  readonly title: string;
  readonly text: string;
  readonly icon: ReactElement;
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const STEPS: readonly Step[] = [
  {
    title: "Parse",
    text: "TypeScript Compiler API, in your browser.",
    icon: <path {...P} d="M8 5 3 12l5 7M16 5l5 7-5 7M13.5 4l-3 16" />,
  },
  {
    title: "Analyze",
    text: "Call graph, complexity, findings, blast radius.",
    icon: <path {...P} d="M12 5v5M12 10 6 17M12 10l6 7M12 3.5a1.5 1.5 0 1 0 0 .01M6 18.5a1.5 1.5 0 1 0 0 .01M18 18.5a1.5 1.5 0 1 0 0 .01" />,
  },
  {
    title: "Mutate",
    text: "Surgical splices with SHA-256 verified rollback.",
    icon: <path {...P} d="M4 20 15 9M13 5l6 6M16 3l5 5M4 20l1-4 3 3z" />,
  },
];

export function HowItWorks() {
  return (
    <section className="section how-it-works" aria-labelledby="how-it-works-title">
      <p className="eyebrow">The pipeline</p>
      <h2 id="how-it-works-title" className="section-title">
        How it works
      </h2>
      <ol className="how-it-works-steps">
        {STEPS.map((step, index) => (
          <li key={step.title} className="how-it-works-step">
            <svg className="how-it-works-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" focusable="false" data-step={index}>
              {step.icon}
            </svg>
            <h3 className="how-it-works-name">{step.title}</h3>
            <p className="how-it-works-text">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="how-it-works-note">
        Same engine, zero domain words in the core — enforced by a boundary linter.
      </p>
    </section>
  );
}
