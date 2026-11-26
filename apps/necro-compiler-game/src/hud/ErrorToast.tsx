import { useEffect } from "react";

interface Props {
  readonly message: string | null;
  readonly onDismiss: () => void;
}

const TOAST_MS = 6000;

export function ErrorToast({ message, onDismiss }: Props) {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (message === null) return null;
  return (
    <div className="hud-panel hud-toast" role="alert">
      <span>The spell failed: {message}</span>
      <button type="button" className="hud-close" aria-label="Dismiss error" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
