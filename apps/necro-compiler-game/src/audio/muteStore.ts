export const STORAGE_KEY = "necro-compiler.muted";

export type MuteState = boolean;

export interface MuteStore {
  readonly value: MuteState;
  set(next: MuteState): void;
  subscribe(listener: (value: MuteState) => void): () => void;
}

/** Only the exact strings "true" and "false" are honoured; everything else is unmuted. */
export function readMuteState(storageKey: string): MuteState {
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

export function writeMuteState(storageKey: string, value: MuteState): void {
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Storage unavailable: the in-memory value remains authoritative.
  }
}

export function createMuteStore(storageKey: string = STORAGE_KEY): MuteStore {
  let current = readMuteState(storageKey);
  const listeners = new Set<(value: MuteState) => void>();
  return {
    get value() {
      return current;
    },
    set(next) {
      if (next === current) return;
      current = next;
      writeMuteState(storageKey, next);
      listeners.forEach((listener) => listener(next));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
