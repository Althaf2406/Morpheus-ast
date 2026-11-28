import { useEffect, useRef, useState } from "react";
import type { CandidateFile } from "../../adapter.ts";
import { buttonStyle, FIELD, LABEL, MUTED, ROW } from "./loadStyles.ts";

interface Props {
  readonly disabled: boolean;
  readonly onSubmit: (produce: () => Promise<readonly CandidateFile[]>) => void;
}

// --- Helpers ---

function relativePath(file: File): string {
  return file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name;
}

async function readAll(files: readonly File[]): Promise<readonly CandidateFile[]> {
  return Promise.all(
    files.map(async (f): Promise<CandidateFile> => ({ path: relativePath(f), content: await f.text() })),
  );
}

// --- Component ---

export function UploadTab({ disabled, onSubmit }: Props) {
  const [files, setFiles] = useState<readonly File[]>([]);
  const folderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const pick = (e: React.ChangeEvent<HTMLInputElement>): void =>
    setFiles(Array.from(e.target.files ?? []));

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    onSubmit(() => readAll(files));
  };

  return (
    <form onSubmit={submit}>
      <label style={LABEL} htmlFor="load-upload-files">Choose files</label>
      <input id="load-upload-files" type="file" multiple style={FIELD} disabled={disabled} onChange={pick} />
      <label style={LABEL} htmlFor="load-upload-folder">Or choose a folder</label>
      <input id="load-upload-folder" type="file" ref={folderRef} style={FIELD} disabled={disabled} onChange={pick} />
      <div style={{ ...ROW, ...MUTED }} aria-live="polite">
        {files.length === 0 ? "No files selected" : `${files.length} file(s) selected`}
      </div>
      <button type="submit" style={buttonStyle(disabled || files.length === 0)} disabled={disabled || files.length === 0}>
        Load files
      </button>
    </form>
  );
}
