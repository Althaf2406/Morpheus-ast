import { useState } from "react";
import { buttonStyle, FIELD, LABEL, MUTED, ROW } from "./loadStyles.ts";

interface Props {
  readonly disabled: boolean;
  readonly initialRepo: string;
  readonly onSubmit: (ref: string) => void;
}

export function GitHubTab({ disabled, initialRepo, onSubmit }: Props) {
  const [repo, setRepo] = useState(initialRepo);
  const empty = repo.trim() === "";

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!empty) onSubmit(repo);
  };

  return (
    <form onSubmit={submit}>
      <label style={LABEL} htmlFor="load-github-repo">Public GitHub repository</label>
      <input
        id="load-github-repo"
        style={FIELD}
        value={repo}
        disabled={disabled}
        placeholder="owner/name or https://github.com/owner/name"
        onChange={(e) => setRepo(e.target.value)}
      />
      <div style={{ ...ROW, ...MUTED }}>No token is used or stored.</div>
      <button type="submit" style={buttonStyle(disabled || empty)} disabled={disabled || empty}>
        Load
      </button>
    </form>
  );
}
