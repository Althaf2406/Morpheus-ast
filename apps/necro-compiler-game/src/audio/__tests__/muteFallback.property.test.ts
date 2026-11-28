// @vitest-environment jsdom
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMuteStore, readMuteState, STORAGE_KEY } from "../muteStore";

const DEFAULT_MUTED = false;
const RUNS = 100;

const invalidStoredValue = fc
  .string()
  .filter((value) => value !== "true" && value !== "false");

// In-memory Storage stand-in (Node's localStorage may shadow jsdom's)
function stubStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

describe("Property 2: invalid or absent stored mute values fall back to the default", () => {
  let data: Map<string, string>;

  beforeEach(() => {
    data = stubStorage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the Necro storage key literal", () => {
    expect(STORAGE_KEY).toBe("necro-compiler.muted");
  });

  /** **Validates: Requirements 2.1, 3.2, 3.4** */
  it("readMuteState returns the default for any string other than true/false", () => {
    fc.assert(
      fc.property(invalidStoredValue, (stored) => {
        data.set(STORAGE_KEY, stored);
        expect(readMuteState(STORAGE_KEY)).toBe(DEFAULT_MUTED);
      }),
      { numRuns: RUNS },
    );
  });

  /** **Validates: Requirements 2.1, 3.2, 3.4** */
  it("a new store starts at the default for any invalid stored string", () => {
    fc.assert(
      fc.property(invalidStoredValue, (stored) => {
        data.set(STORAGE_KEY, stored);
        expect(createMuteStore().value).toBe(DEFAULT_MUTED);
      }),
      { numRuns: RUNS },
    );
  });

  /** **Validates: Requirements 2.1, 3.4** */
  it("falls back to the default when the key is absent", () => {
    data.delete(STORAGE_KEY);
    expect(readMuteState(STORAGE_KEY)).toBe(DEFAULT_MUTED);
    expect(createMuteStore().value).toBe(DEFAULT_MUTED);
  });
});
