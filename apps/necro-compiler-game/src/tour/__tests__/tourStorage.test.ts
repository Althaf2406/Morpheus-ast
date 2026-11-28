import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasSeenTour, markTourSeen } from "../tourStorage";

interface MemoryStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function createMemoryStorage(): MemoryStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function stubStorage(storage: MemoryStorage): void {
  vi.stubGlobal("window", { localStorage: storage });
}

describe("tourStorage", () => {
  beforeEach(() => {
    stubStorage(createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports not seen before markTourSeen", () => {
    expect(hasSeenTour()).toBe(false);
  });

  it("markTourSeen persists so hasSeenTour is true", () => {
    markTourSeen();
    expect(hasSeenTour()).toBe(true);
  });

  it("does not crash and returns false when getItem throws", () => {
    stubStorage({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    });
    expect(() => hasSeenTour()).not.toThrow();
    expect(hasSeenTour()).toBe(false);
  });

  it("does not crash when setItem throws", () => {
    stubStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => markTourSeen()).not.toThrow();
  });
});
