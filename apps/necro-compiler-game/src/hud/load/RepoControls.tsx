interface Props {
  /** True while a user-loaded repository is active. */
  readonly loaded: boolean;
  readonly onOpenLoad: () => void;
  readonly onBackToSample: () => void;
}

/** Top bar next to the title: open the load dialog, and leave a loaded repository. */
export function RepoControls({ loaded, onOpenLoad, onBackToSample }: Props) {
  return (
    <div className="hud-panel hud-repo-controls">
      <button type="button" className="hud-button hud-button--cast" onClick={onOpenLoad}>
        Load your code
      </button>
      {loaded && (
        <button type="button" className="hud-button hud-button--undo" onClick={onBackToSample}>
          Back to sample repository
        </button>
      )}
    </div>
  );
}
