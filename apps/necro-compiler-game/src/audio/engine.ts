import { createMuteStore, type MuteStore } from "./muteStore";
import {
  buildDeniedThump,
  buildDroneAmbience,
  buildGong,
  buildPurifyChime,
  buildReverseShimmer,
  buildShimmerRise,
  buildWhisperEffect,
  type EffectBuilder,
} from "./palette";
import type { VoiceHandle } from "./voices";

export const MASTER_GAIN = 0.126; // -18 dB
const MUTE_RAMP_SECONDS = 0.03;

export type ContextFactory = () => AudioContext | null;

export interface AudioEngine {
  readonly isMuted: boolean;
  toggleMute(): void;
  subscribe(listener: (muted: boolean) => void): () => void;
  primeOnGesture(): void;
  startAmbience(): void;
  stopAmbience(): void;
  playSelect(): void;
  playCast(): void;
  playPurify(): void;
  playUndo(): void;
  playDenied(): void;
  playLoadComplete(): void;
  dispose(): void;
}

type LegacyWindow = Window & { webkitAudioContext?: typeof AudioContext };

// Default factory: standard or prefixed constructor, null when unsupported
function defaultContextFactory(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as LegacyWindow).webkitAudioContext;
  return typeof Ctor === "function" ? new Ctor() : null;
}

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Node already stopped, disconnected or closed.
  }
}

export function createAudioEngine(
  contextFactory: ContextFactory = defaultContextFactory,
  store: MuteStore = createMuteStore(),
): AudioEngine {
  let primed = false;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambience: VoiceHandle | null = null;

  function rampMaster(target: number): void {
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + MUTE_RAMP_SECONDS);
  }

  function startAmbience(): void {
    if (!primed || store.value || !context || !master || ambience) return;
    const ctx = context;
    const out = master;
    safely(() => {
      ambience = buildDroneAmbience(ctx, out);
    });
  }

  function stopAmbience(): void {
    const handle = ambience;
    ambience = null;
    if (handle) safely(() => handle.stop());
  }

  function play(builder: EffectBuilder): void {
    if (!primed || store.value || !context || !master) return;
    const ctx = context;
    const out = master;
    safely(() => builder(ctx, out)); // sound must never break the caller
  }

  return {
    get isMuted() {
      return store.value;
    },
    subscribe: (listener) => store.subscribe(listener),
    toggleMute() {
      const muted = !store.value;
      store.set(muted);
      if (muted) {
        rampMaster(0);
        stopAmbience();
      } else if (primed) {
        rampMaster(MASTER_GAIN);
        startAmbience();
      }
    },
    primeOnGesture() {
      if (primed) return;
      primed = true;
      try {
        context = contextFactory();
      } catch {
        context = null;
      }
      if (!context) return;
      master = context.createGain();
      master.gain.value = store.value ? 0 : MASTER_GAIN;
      master.connect(context.destination);
      void Promise.resolve(context.resume()).catch(() => undefined);
      startAmbience();
    },
    startAmbience,
    stopAmbience,
    playSelect: () => play(buildWhisperEffect),
    playCast: () => play(buildShimmerRise),
    playPurify: () => play(buildPurifyChime),
    playUndo: () => play(buildReverseShimmer),
    playDenied: () => play(buildDeniedThump),
    playLoadComplete: () => play(buildGong),
    dispose() {
      stopAmbience();
      const node = master;
      const ctx = context;
      if (node) safely(() => node.disconnect());
      if (ctx) safely(() => void Promise.resolve(ctx.close()).catch(() => undefined));
      master = null;
      context = null;
      primed = false;
    },
  };
}

let singleton: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  singleton ??= createAudioEngine();
  return singleton;
}
