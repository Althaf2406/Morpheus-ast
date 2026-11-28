import { useState } from "react";
import type { CandidateFile } from "../../adapter.ts";
import { buttonStyle, FIELD, LABEL } from "./loadStyles.ts";

interface Props {
  readonly disabled: boolean;
  readonly onSubmit: (produce: () => Promise<readonly CandidateFile[]>) => void;
}

const DEFAULT_NAME = "pasted.ts";

export function PasteTab({ disabled, onSubmit }: Props) {
  const [filename, setFilename] = useState(DEFAULT_NAME);
  const [code, setCode] = useState("");

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const path = filename.trim() || DEFAULT_NAME;
    onSubmit(async () => [{ path, content: code }]);
  };

  return (
    <form onSubmit={submit}>
      <label style={LABEL} htmlFor="load-paste-filename">Filename</label>
      <input
        id="load-paste-filename"
        style={FIELD}
        value={filename}
        disabled={disabled}
        onChange={(e) => setFilename(e.target.value)}
      />
      <label style={LABEL} htmlFor="load-paste-code">Code</label>
      <textarea
        id="load-paste-code"
        style={{ ...FIELD, minHeight: 160, resize: "vertical" }}
        value={code}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" style={buttonStyle(disabled)} disabled={disabled}>
        Load code
      </button>
    </form>
  );
}
