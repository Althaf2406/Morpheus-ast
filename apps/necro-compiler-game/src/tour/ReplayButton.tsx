import "./tour.css";

interface Props {
  readonly onClick: () => void;
}

/** "?" button that restarts the tour. */
export function ReplayButton({ onClick }: Props) {
  return (
    <button type="button" className="tour-replay" aria-label="Replay tour" onClick={onClick}>
      ?
    </button>
  );
}
