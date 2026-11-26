interface Props {
  readonly aliveCount: number;
  readonly totalCount: number;
  readonly purifiedCount: number;
}

/** Monsters still alive out of the total, and the purified count in its own element. */
export function CounterBar({ aliveCount, totalCount, purifiedCount }: Props) {
  return (
    <div className="hud-counters" role="status" aria-label="Progress">
      <span className="hud-counter hud-counter--monsters">{`Monsters ${aliveCount} / ${totalCount}`}</span>
      <span className="hud-counter hud-counter--purified">{`Purified ${purifiedCount}`}</span>
    </div>
  );
}
