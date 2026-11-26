import { useEffect, useRef } from "react";

export interface SpellKeyActions {
  readonly onCast: () => void;
  readonly onUndo: () => void;
  readonly onCancel: () => void;
}

const isInteractive = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest("button, a, input, textarea, select") !== null;

/** Enter casts, Cmd/Ctrl+Z undoes, Esc cancels the selection. */
export function useSpellKeys(actions: SpellKeyActions): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      const { onCast, onUndo, onCancel } = actionsRef.current;
      if (event.key === "Escape") {
        onCancel();
      } else if (event.key === "Enter" && !isInteractive(event.target)) {
        event.preventDefault();
        onCast();
      } else if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        onUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
