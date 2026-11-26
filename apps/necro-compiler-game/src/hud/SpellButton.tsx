import type { ReactNode } from "react";

interface Props {
  readonly variant: "cast" | "undo";
  readonly label: string;
  readonly shortcut: string;
  /** Keys for aria-keyshortcuts, e.g. "Enter". */
  readonly keys: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}

export function SpellButton({ variant, label, shortcut, keys, disabled, busy, onClick, children }: Props) {
  return (
    <button
      type="button"
      className={`hud-button hud-button--${variant}`}
      aria-label={`${label} (${shortcut})`}
      aria-keyshortcuts={keys}
      aria-busy={busy}
      disabled={disabled}
      onClick={onClick}
    >
      <span>{children}</span>
      <kbd className="hud-kbd" aria-hidden="true">{shortcut}</kbd>
    </button>
  );
}
