import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getAudioEngine } from "./engine";

const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export interface MuteControls {
  readonly muted: boolean;
  readonly toggleMute: () => void;
}

/** Read-only view of the mute state; registers no document listeners. */
export function useMuteControls(): MuteControls {
  const engine = getAudioEngine();
  const muted = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.isMuted,
    () => false,
  );
  const toggleMute = useCallback(() => engine.toggleMute(), [engine]);
  return { muted, toggleMute };
}

function isTextFocus(): boolean {
  return TEXT_TAGS.has(document.activeElement?.tagName ?? "");
}

/** Mount once near the root: gesture priming, "M" shortcut and cleanup on unmount. */
export function useAudioEngine(): MuteControls {
  useEffect(() => {
    const engine = getAudioEngine();

    const removeGestureListeners = (): void => {
      GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, onGesture));
    };
    function onGesture(): void {
      removeGestureListeners();
      engine.primeOnGesture();
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTextFocus()) return;
      engine.toggleMute();
    };

    GESTURE_EVENTS.forEach((type) => document.addEventListener(type, onGesture));
    document.addEventListener("keydown", onKey);
    return () => {
      removeGestureListeners();
      document.removeEventListener("keydown", onKey);
      engine.dispose();
    };
  }, []);

  return useMuteControls();
}
