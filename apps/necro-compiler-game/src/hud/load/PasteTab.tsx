import { useState } from "react";
import type { CandidateFile } from "../../adapter";

interface Props {
  readonly busy: boolean;
  readonly onSubmit: (candidates: readonly CandidateFile[]) => void;
}

export function PasteTab({ busy, onSubmit }: Props) {
  const [fileName, setFileName] = useState("pasted.ts");
  const [code, setCode] = useState("");
  const path = fileName.trim() || "pasted.ts";

  return (
    <form
      className="load-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit([{ path, content: code }]);
      }}
    >
      <label className="load-label">
        File name
        <input className="load-input" value={fileName} onChange={(e) => setFileName(e.target.value)} disabled={busy} />
      </label>
      <label className="load-label">
        Code to summon
        <textarea
          className="load-input load-textarea"
          value={code}
          rows={10}
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" className="hud-button hud-button--cast" disabled={busy || code.trim() === ""}>
        Summon dungeon
      </button>
    </form>
  );
}
