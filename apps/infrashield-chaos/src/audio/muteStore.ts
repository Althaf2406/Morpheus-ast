// --- Mute state persistence (Infra_App) ---

export const STORAGE_KEY = "infrashield-chaos.muted";

export type MuteState = boolean;

export interface MuteStore {
  readonly value: MuteState;
  set(next: MuteState): void;
  subscribe(listener: (value: MuteState) => void): () => void;
}

const DEFAULT_MUTED: MuteState = false;

/** Returns true only for "true", false for "false"; anything else (absent, malformed, throwing) is the default. */
export function readMuteState(storageKey: string): MuteState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_MUTED;
  } catch {
    return DEFAULT_MUTED;
  }
}

export function writeMuteState(storageKey: string, value: MuteState): void {
  try {
    localStorage.setItem(storageKey, value ? "true" : "false");
  } catch {
    // Storage unavailable: the in-memory value remains authoritative.
  }
}

// --- Store ---

export function createMuteStore(storageKey: string = STORAGE_KEY): MuteStore {
  let current = readMuteState(storageKey);
  const listeners = new Set<(value: MuteState) => void>();

  return {
    get value(): MuteState {
      return current;
    },
    set(next: MuteState): void {
      if (next === current) return;
      current = next;
      writeMuteState(storageKey, next);
      for (const listener of [...listeners]) listener(next);
    },
    subscribe(listener: (value: MuteState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
