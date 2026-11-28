// @vitest-environment node
/**
 * Feature: sound-design, Property 2: Invalid or absent stored mute values fall back to the default
 *
 * **Validates: Requirements 2.1, 3.2, 3.4**
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import { createMuteStore, readMuteState, STORAGE_KEY } from "../muteStore";

// --- Fake storage ---

function stubStorage(stored: string | null): void {
  vi.stubGlobal("localStorage", {
    getItem: (key: string): string | null => (key === STORAGE_KEY ? stored : null),
    setItem: (): void => undefined,
  });
}

const invalidStored = fc
  .string({ maxLength: 40 })
  .filter((s) => s !== "true" && s !== "false");

const RUNS = { numRuns: 100 };

describe("mute fallback (Infra_App)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readMuteState returns the unmuted default for any stored string other than 'true'/'false'", () => {
    fc.assert(
      fc.property(invalidStored, (stored) => {
        stubStorage(stored);
        return readMuteState(STORAGE_KEY) === false;
      }),
      RUNS,
    );
  });

  it("createMuteStore initializes unmuted for any invalid stored string", () => {
    fc.assert(
      fc.property(invalidStored, (stored) => {
        stubStorage(stored);
        return createMuteStore(STORAGE_KEY).value === false;
      }),
      RUNS,
    );
  });

  it("falls back to unmuted when the key is absent", () => {
    stubStorage(null);
    expect(readMuteState(STORAGE_KEY)).toBe(false);
    expect(createMuteStore(STORAGE_KEY).value).toBe(false);
  });
});
