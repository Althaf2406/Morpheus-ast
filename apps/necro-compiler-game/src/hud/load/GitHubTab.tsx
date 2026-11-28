import { useState } from "react";

interface Props {
  readonly busy: boolean;
  readonly initialRepo?: string;
  readonly onSubmit: (ref: string) => void;
}

export function GitHubTab({ busy, initialRepo = "", onSubmit }: Props) {
  const [repo, setRepo] = useState(initialRepo);

  return (
    <form
      className="load-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(repo.trim());
      }}
    >
      <label className="load-label">
        GitHub repository (owner/name or URL)
        <input
          className="load-input"
          value={repo}
          placeholder="owner/name"
          onChange={(e) => setRepo(e.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" className="hud-button hud-button--cast" disabled={busy || repo.trim() === ""}>
        Load
      </button>
    </form>
  );
}
