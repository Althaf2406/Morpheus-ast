interface Props {
  readonly goalLine: string;
}

/** Top-left title and one-line goal. */
export function HudTitle({ goalLine }: Props) {
  return (
    <header className="hud-panel hud-heading">
      <h1 className="hud-title hud-heading__title">NECRO-COMPILER</h1>
      <p className="hud-heading__goal">{goalLine}</p>
    </header>
  );
}
