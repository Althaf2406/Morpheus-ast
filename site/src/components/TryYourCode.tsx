import { useState } from "react";
import type { FormEvent } from "react";
import { REPO_FORMAT_HINT, buildAppUrl, parseRepoReference } from "../repoLink";
import "./tryYourCode.css";

const NECRO_URL = "https://necro-compiler.vercel.app";
const INFRA_URL = "https://infrashield-3d.vercel.app";
const EXAMPLES: readonly string[] = ["sindresorhus/p-limit", "expressjs/cors", "sindresorhus/ky"];

export function TryYourCode() {
  const [value, setValue] = useState("");
  const [showError, setShowError] = useState(false);

  const open = (baseUrl: string): void => {
    const slug = parseRepoReference(value);
    if (slug === null) {
      setShowError(true);
      return;
    }
    setShowError(false);
    window.location.assign(buildAppUrl(baseUrl, slug));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    open(NECRO_URL);
  };

  return (
    <section className="section try-code" aria-labelledby="try-code-title">
      <p className="eyebrow">Bring your own repo</p>
      <h2 id="try-code-title" className="section-title">
        Try it on your own code
      </h2>
      <div className="try-code-frame">
      <form className="try-code-form" onSubmit={onSubmit} noValidate>
        <label className="try-code-label" htmlFor="try-code-input">
          GitHub repository
        </label>
        <div className="try-code-row">
        <input
          id="try-code-input"
          className="try-code-input"
          type="text"
          value={value}
          placeholder="owner/repo or https://github.com/owner/repo"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showError}
          aria-describedby="try-code-message"
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <div className="try-code-actions">
          <button type="button" className="try-code-button try-code-button--ember" onClick={() => open(NECRO_URL)}>
            Open as dungeon
          </button>
          <button type="button" className="try-code-button try-code-button--cyan" onClick={() => open(INFRA_URL)}>
            Open as city
          </button>
        </div>
        </div>
        <div className="try-code-message-slot">
          <p id="try-code-message" className="try-code-message" role={showError ? "alert" : undefined}>
            {showError ? REPO_FORMAT_HINT : ""}
          </p>
        </div>
      </form>
      <div className="try-code-examples">
        <span className="try-code-try">Try:</span>
        <ul className="try-code-chips" aria-label="Example repositories">
        {EXAMPLES.map((slug) => (
          <li key={slug}>
            <button
              type="button"
              className="try-code-chip"
              onClick={() => {
                setValue(slug);
                setShowError(false);
              }}
            >
              {slug}
            </button>
          </li>
        ))}
        </ul>
      </div>
      </div>
    </section>
  );
}
