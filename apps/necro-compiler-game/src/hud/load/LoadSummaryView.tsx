import type { LoadSuccess } from "./useLoadDialog";

interface Props {
  readonly outcome: LoadSuccess;
  readonly onDone: () => void;
}

export function LoadSummaryView({ outcome, onDone }: Props) {
  const { filesAnalyzed, findingsCount, skipped } = outcome;

  return (
    <div className="load-summary">
      <p className="hud-empty" role="status">
        {filesAnalyzed} files analyzed / {skipped.length} skipped / {findingsCount} monsters found
      </p>
      {skipped.length > 0 && (
        <>
          <h3 className="hud-title">Skipped files</h3>
          <ul className="hud-list load-skipped">
            {skipped.map((file) => (
              <li key={file.path} className="hud-entry">
                <span className="hud-code">{file.path}</span>
                <span className="hud-entry__meta">{file.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="hud-button hud-button--cast" onClick={onDone} autoFocus>
        Done
      </button>
    </div>
  );
}
