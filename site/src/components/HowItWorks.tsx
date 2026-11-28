const STEPS: readonly string[] = [
  "Parse with the TypeScript Compiler API",
  "Analyze topology and findings",
  "Mutate surgically with SHA-256 verified rollback",
];

export function HowItWorks() {
  return (
    <section className="how-it-works" aria-labelledby="how-it-works-title">
      <h2 id="how-it-works-title" className="section-title">
        How it works
      </h2>
      <ol className="how-it-works-steps">
        {STEPS.map((step) => (
          <li key={step} className="how-it-works-step">
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
