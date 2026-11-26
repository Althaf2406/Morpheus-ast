interface Props {
  readonly message: string;
  readonly onRetry: () => void;
}

export function ErrorPanel({ message, onRetry }: Props) {
  return (
    <div className="hud-panel" role="alert">
      <p>The dungeon could not be summoned: {message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
