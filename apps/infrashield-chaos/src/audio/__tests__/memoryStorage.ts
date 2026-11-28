import { vi } from "vitest";

export interface MemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Installs an in-memory localStorage (Node's experimental global shadows jsdom's). */
export function installMemoryStorage(): Map<string, string> {
  const data = new Map<string, string>();
  const storage: MemoryStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  vi.stubGlobal("localStorage", storage);
  return data;
}

/** Installs a localStorage whose reads and writes both throw. */
export function installThrowingStorage(): void {
  const fail = (): never => {
    throw new Error("denied");
  };
  vi.stubGlobal("localStorage", { getItem: fail, setItem: fail });
}
