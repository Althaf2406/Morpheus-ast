const REPO_URL = "https://github.com/Althaf2406/Morpheus-ast";
const KIRO_USAGE_URL = `${REPO_URL}/blob/main/docs/KIRO_USAGE.md`;

interface Feature {
  readonly name: string;
  readonly fact: string;
}

const FEATURES: readonly Feature[] = [
  { name: "Specs", fact: "9 feature specs + 7 bugfix specs" },
  { name: "Steering", fact: "4 steering files" },
  { name: "Hooks", fact: "4 hooks run on save and on stop" },
  { name: "Property-based tests", fact: "fast-check properties in core and both apps" },
];

export function BuiltWithKiro() {
  return (
    <section className="section built-with-kiro" aria-labelledby="built-with-kiro-title">
      <p className="eyebrow">The process</p>
      <h2 id="built-with-kiro-title" className="section-title">
        Built with Kiro
      </h2>
      <ul className="built-with-kiro-list">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="built-with-kiro-item">
            <h3 className="built-with-kiro-name">{feature.name}</h3>
            <p className="built-with-kiro-fact">{feature.fact}</p>
          </li>
        ))}
      </ul>
      <p className="built-with-kiro-links">
        <a className="kiro-btn kiro-btn--primary" href={REPO_URL}>
          View on GitHub
        </a>
        <a className="kiro-btn" href={KIRO_USAGE_URL}>
          Read how we used Kiro
        </a>
      </p>
    </section>
  );
}
