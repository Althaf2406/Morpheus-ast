import { useCallback, useEffect, useState } from "react";

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']") !== null;

/** Open state of the inspector, toggled by the "I" key (ignored while typing or with a modifier). */
export function useInspectorOpen(): { readonly open: boolean; readonly toggle: () => void } {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "i" && !isTyping(event.target)) toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
  return { open, toggle };
}
