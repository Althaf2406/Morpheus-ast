/**
 * Unit tests for guarded tour persistence.
 * Validates: Requirements 15.3, 15.6
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasSeenTour, markTourSeen } from "../tourStorage";

// --- Fixtures ---
const KEY = "morpheus-tour-seen-infra";

function installStorage(overrides: Partial<Storage> = {}): Map<string, string> {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      data.set(k, v);
    },
    ...overrides,
  };
  vi.stubGlobal("window", { localStorage: storage });
  return data;
}

describe("tourStorage", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports not seen before marking", () => {
    expect(hasSeenTour()).toBe(false);
  });

  it("markTourSeen persists under the infra key so hasSeenTour is true", () => {
    const data = installStorage();
    markTourSeen();
    expect(data.has(KEY)).toBe(true);
    expect(hasSeenTour()).toBe(true);
  });

  it("keeps app keys separate", () => {
    markTourSeen("infra");
    expect(hasSeenTour("necro")).toBe(false);
  });

  it("does not throw and reports not seen when getItem throws", () => {
    installStorage({
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => hasSeenTour()).not.toThrow();
    expect(hasSeenTour()).toBe(false);
  });

  it("does not throw when setItem throws", () => {
    installStorage({
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => markTourSeen()).not.toThrow();
  });
});
