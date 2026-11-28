import { useState, type ChangeEvent } from "react";
import type { CandidateFile } from "../../adapter";

interface Props {
  readonly busy: boolean;
  readonly onSubmit: (read: () => Promise<readonly CandidateFile[]>) => void;
}

/** webkitRelativePath is empty for plain file pickers, so fall back to the name. */
async function toCandidate(file: File): Promise<CandidateFile> {
  const path = file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name;
  return { path, content: await file.text() };
}

export function UploadTab({ busy, onSubmit }: Props) {
  const [files, setFiles] = useState<readonly File[]>([]);

  const pick = (event: ChangeEvent<HTMLInputElement>): void => {
    setFiles(Array.from(event.target.files ?? []));
  };
  // Directory picking is non-standard in React's typings, so pass it as a spread attribute.
  const folderAttrs = { webkitdirectory: "" };

  return (
    <form
      className="load-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(() => Promise.all(files.map(toCandidate)));
      }}
    >
      <label className="load-label">
        Choose files
        <input className="load-input" type="file" multiple onChange={pick} disabled={busy} />
      </label>
      <label className="load-label">
        Choose a folder
        <input className="load-input" type="file" multiple onChange={pick} disabled={busy} {...folderAttrs} />
      </label>
      <p className="hud-empty" aria-live="polite">
        {files.length === 0 ? "No files chosen." : `${files.length} file(s) ready to summon.`}
      </p>
      <button type="submit" className="hud-button hud-button--cast" disabled={busy || files.length === 0}>
        Summon dungeon
      </button>
    </form>
  );
}
