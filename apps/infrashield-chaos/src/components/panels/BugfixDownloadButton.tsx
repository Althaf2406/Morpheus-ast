import { useState } from "react";
import type { InfraShieldAdapter } from "../../adapter.ts";
import { getAudioEngine } from "../../audio";
import { downloadTextFile } from "./downloadFile.ts";
import { CARD, BTN_ACTIVE, BTN_DISABLED, ERROR_BOX } from "./bugfixSpecStyles.ts";
// --- Types ---
/** Structural interface: only the method the download button calls. */
export type BugfixFileProvider = Pick<InfraShieldAdapter, "generateBugfixFile">;
interface Props {
  readonly adapter:   BugfixFileProvider;
  readonly isEnabled: boolean;
}
// --- Component ---
export function BugfixDownloadButton({ adapter, isEnabled }: Props) {
  const [error, setError] = useState("");
  function handleDownload(): void {
    if (!isEnabled) return;
    setError("");
    try {
      const { fileName, content } = adapter.generateBugfixFile();
      downloadTextFile(fileName, content);
      getAudioEngine().playBugfixClick();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <div style={{ ...CARD, paddingTop: 0 }}>
      <button style={isEnabled ? BTN_ACTIVE : BTN_DISABLED} disabled={!isEnabled} onClick={handleDownload}>
        Download bugfix.md
      </button>
      {error !== "" && <div style={ERROR_BOX} role="alert">✖ {error}</div>}
    </div>
  );
}
