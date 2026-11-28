const REPO_URL = "https://github.com/Althaf2406/Morpheus-ast";
const KIRO_USAGE_URL = `${REPO_URL}/blob/main/docs/KIRO_USAGE.md`;

const FEATURES: readonly string[] = [
  "Specs",
  "Steering",
  "Hooks",
  "Property-based tests",
];

export function BuiltWithKiro() {
  return (
    <section className="built-with-kiro" aria-labelledby="built-with-kiro-title">
      <h2 id="built-with-kiro-title" className="section-title">
        Built with Kiro
      </h2>
      <ul className="built-with-kiro-list">
        {FEATURES.map((feature) => (
          <li key={feature} className="built-with-kiro-item">
            {feature}
          </li>
        ))}
      </ul>
      <p className="built-with-kiro-links">
        <a className="built-with-kiro-link" href={REPO_URL}>
          GitHub repository
        </a>
        <a className="built-with-kiro-link" href={KIRO_USAGE_URL}>
          docs/KIRO_USAGE.md
        </a>
      </p>
    </section>
  );
}
