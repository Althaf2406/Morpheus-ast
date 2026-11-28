// --- InfraShield audio engine: gesture gate, mute, ambience, effects ---

import { createMuteStore, type MuteStore } from "./muteStore";
import {
  buildAlarmEffect,
  buildBugfixClickEffect,
  buildCascadeTick,
  buildLoadCompleteChime,
  buildPatchAppliedEffect,
  buildPatchRollbackEffect,
  buildServerHumAmbience,
} from "./palette";
import { createSession, defaultContextFactory, MASTER_GAIN } from "./session";
import type { VoiceTarget } from "./voices";

export interface AudioEngine {
  readonly isMuted: boolean;
  toggleMute(): void;
  subscribe(listener: (muted: boolean) => void): () => void;
  primeOnGesture(): void;
  startAmbience(): void;
  stopAmbience(): void;
  playFaultAlarm(): void;
  playCascadeTick(): void;
  playPatchApplied(): void;
  playPatchRollback(): void;
  playBugfixClick(): void;
  playLoadComplete(): void;
  dispose(): void;
}

export interface EngineOptions {
  /** Test seam; defaults to the global AudioContext (or webkitAudioContext). */
  readonly contextFactory?: () => AudioContext;
  readonly muteStore?: MuteStore;
}

export function createAudioEngine(options: EngineOptions = {}): AudioEngine {
  const store = options.muteStore ?? createMuteStore();
  const session = createSession(options.contextFactory ?? defaultContextFactory());
  let primed = false;
  let stopHum: (() => void) | null = null;

  function target(): VoiceTarget | null {
    const { context, master } = session;
    if (!primed || store.value || !context || !master) return null;
    return { context, destination: master, track: session.track };
  }

  function play(build: (t: VoiceTarget) => void): void {
    const t = target();
    if (!t) return;
    try {
      build(t);
    } catch {
      // Sound must never break the UI handler that requested it.
    }
  }

  function startAmbience(): void {
    const t = target();
    if (!t || stopHum) return;
    try {
      stopHum = buildServerHumAmbience(t);
    } catch {
      stopHum = null;
    }
  }

  function stopAmbience(): void {
    const stop = stopHum;
    stopHum = null;
    try {
      stop?.();
    } catch {
      // Already stopped.
    }
  }

  function primeOnGesture(): void {
    if (primed) return;
    primed = true;
    if (session.open(store.value)) startAmbience();
  }

  function toggleMute(): void {
    const next = !store.value;
    store.set(next);
    if (!primed || !session.context) return;
    session.setMaster(next ? 0 : MASTER_GAIN);
    if (next) stopAmbience();
    else startAmbience();
  }

  function dispose(): void {
    stopAmbience();
    session.close();
    primed = false;
  }

  return {
    get isMuted(): boolean {
      return store.value;
    },
    toggleMute,
    subscribe: (listener) => store.subscribe(listener),
    primeOnGesture,
    startAmbience,
    stopAmbience,
    playFaultAlarm: () => play(buildAlarmEffect),
    playCascadeTick: () => play(buildCascadeTick),
    playPatchApplied: () => play(buildPatchAppliedEffect),
    playPatchRollback: () => play(buildPatchRollbackEffect),
    playBugfixClick: () => play(buildBugfixClickEffect),
    playLoadComplete: () => play(buildLoadCompleteChime),
    dispose,
  };
}

// --- Singleton ---

let singleton: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  singleton ??= createAudioEngine();
  return singleton;
}
