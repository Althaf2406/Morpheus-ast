import "./hero.css";

export function Hero() {
  return (
    <header className="hero">
      <svg className="hero-tree" viewBox="0 0 600 400" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMin slice">
        <g className="hero-tree-stem" fill="none" strokeWidth="1.5">
          <path d="M300 0 V120" stroke="#b9b6c4" />
          <path d="M300 120 C300 160 200 170 160 230 M160 230 L100 330 M160 230 L220 330" stroke="#e0603a" />
          <path d="M300 120 C300 160 400 170 440 230 M440 230 L380 330 M440 230 L500 330" stroke="#5ee0ff" />
        </g>
        <g className="hero-tree-nodes">
          <circle cx="300" cy="40" r="4" fill="#b9b6c4" />
          <circle cx="300" cy="120" r="6" fill="#b9b6c4" />
          <circle cx="160" cy="230" r="5" fill="#e0603a" />
          <circle cx="100" cy="330" r="4" fill="#e0603a" />
          <circle cx="220" cy="330" r="4" fill="#f2c14e" />
          <circle cx="440" cy="230" r="5" fill="#5ee0ff" />
          <circle cx="380" cy="330" r="4" fill="#5ee0ff" />
          <circle cx="500" cy="330" r="4" fill="#5ee0ff" />
        </g>
      </svg>
      <p className="eyebrow">Kiroween 2026 · Skeleton Crew</p>
      <h1 className="hero-title">
        <span className="hero-brand">MORPHEUS-AST:</span>{" "}
        <span className="hero-bone">One skeleton.</span>{" "}
        <span className="hero-split">Two worlds.</span>
      </h1>
      <p className="hero-subtitle">
        One headless code-analysis engine powers both apps.
      </p>
    </header>
  );
}
