import type { ReactNode } from "react";

interface Props {
  readonly goalLine: string;
  readonly children?: ReactNode;
}

/** Top-left panel: title, one-line goal, and the progress counters passed as children. */
export function HudTitle({ goalLine, children }: Props) {
  return (
    <header className="hud-panel hud-heading">
      <h1 className="hud-title hud-heading__title">NECRO-COMPILER</h1>
      <p className="hud-heading__goal">{goalLine}</p>
      {children}
    </header>
  );
}
