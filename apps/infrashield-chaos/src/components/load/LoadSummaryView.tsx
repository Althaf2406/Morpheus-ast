import { buttonStyle, MUTED, ROW } from "./loadStyles.ts";
import type { LoadSuccess } from "./useLoadDialog.ts";

interface Props {
  readonly outcome: LoadSuccess;
  readonly onDone: () => void;
}

export function LoadSummaryView({ outcome, onDone }: Props) {
  const { filesAnalyzed, findingsCount, skipped } = outcome;
  return (
    <div>
      <div style={ROW}>Files analyzed: <span style={{ color: "#00e5ff" }}>{filesAnalyzed}</span></div>
      <div style={ROW}>Files skipped: <span style={{ color: "#ffaa00" }}>{skipped.length}</span></div>
      {skipped.length > 0 && (
        <ul aria-label="Skipped files" style={{ ...ROW, ...MUTED, paddingLeft: 18, maxHeight: 160, overflowY: "auto" }}>
          {skipped.map((s) => (
            <li key={`${s.path}:${s.reason}`}>
              <span style={{ color: "#c9d1d9" }}>{s.path}</span> — {s.reason}
            </li>
          ))}
        </ul>
      )}
      <div style={ROW}>Findings: <span style={{ color: "#e6edf3" }}>{findingsCount}</span></div>
      <button type="button" style={buttonStyle(false)} onClick={onDone} autoFocus>
        Done
      </button>
    </div>
  );
}
