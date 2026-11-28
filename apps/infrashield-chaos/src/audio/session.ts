// --- AudioContext session: context, Master_Gain, live-source registry ---

export const MASTER_GAIN = 0.126;
const RAMP_SECONDS = 0.03;

type ContextCtor = new () => AudioContext;

export function defaultContextFactory(): (() => AudioContext) | null {
  const scope = globalThis as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return typeof Ctor === "function" ? () => new Ctor() : null;
}

export interface AudioSession {
  /** Creates the context and Master_Gain; returns false when unsupported or creation fails. */
  open(muted: boolean): boolean;
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
  track(source: AudioScheduledSourceNode): void;
  setMaster(level: number): void;
  close(): void;
}

export function createSession(factory: (() => AudioContext) | null): AudioSession {
  const live = new Set<AudioScheduledSourceNode>();
  let context: AudioContext | null = null;
  let master: GainNode | null = null;

  return {
    get context(): AudioContext | null {
      return context;
    },
    get master(): GainNode | null {
      return master;
    },
    open(muted: boolean): boolean {
      if (!factory) return false;
      try {
        context = factory();
        master = context.createGain();
        master.gain.setValueAtTime(muted ? 0 : MASTER_GAIN, context.currentTime);
        master.connect(context.destination);
        void Promise.resolve(context.resume()).catch(() => undefined);
        return true;
      } catch {
        context = null;
        master = null;
        return false;
      }
    },
    track(source: AudioScheduledSourceNode): void {
      live.add(source);
      if (typeof source.addEventListener === "function") {
        source.addEventListener("ended", () => live.delete(source));
      }
    },
    setMaster(level: number): void {
      if (!context || !master) return;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(level, now + RAMP_SECONDS);
    },
    close(): void {
      for (const source of live) {
        try {
          source.stop();
        } catch {
          // Never started or already stopped.
        }
        try {
          source.disconnect();
        } catch {
          // Already disconnected.
        }
      }
      live.clear();
      try {
        master?.disconnect();
        void Promise.resolve(context?.close()).catch(() => undefined);
      } catch {
        // Context already closed.
      }
      context = null;
      master = null;
    },
  };
}
