import { useEffect, useState } from "react";
import { getAudioEngine, type AudioEngine } from "./engine";

// --- Constants ---
const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
const TEXT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export interface AudioControls {
  readonly engine: AudioEngine;
  readonly muted: boolean;
  readonly toggleMute: () => void;
}

function isTextFocus(): boolean {
  const active = document.activeElement;
  return active !== null && TEXT_TAGS.has(active.tagName);
}

/** Mount once near the root: owns Gesture priming, the M key, and unmount cleanup. */
export function useAudioEngine(): AudioControls {
  const engine = getAudioEngine();
  const [muted, setMuted] = useState<boolean>(engine.isMuted);

  useEffect(() => {
    setMuted(engine.isMuted);
    const unsubscribe = engine.subscribe(setMuted);

    const onGesture = (): void => {
      for (const name of GESTURE_EVENTS) document.removeEventListener(name, onGesture);
      engine.primeOnGesture();
    };
    for (const name of GESTURE_EVENTS) document.addEventListener(name, onGesture);

    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "m" && event.key !== "M") return;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextFocus()) return;
      engine.toggleMute();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      unsubscribe();
      for (const name of GESTURE_EVENTS) document.removeEventListener(name, onGesture);
      document.removeEventListener("keydown", onKey);
      engine.dispose();
    };
  }, [engine]);

  return { engine, muted, toggleMute: () => engine.toggleMute() };
}
