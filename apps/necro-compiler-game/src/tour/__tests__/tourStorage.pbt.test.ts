import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSeenTour, markTourSeen } from "../tourStorage";

type StorageMode = "ok" | "throwGet" | "throwSet" | "throwBoth" | "missing" | "noWindow";

interface FakeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function buildStorage(mode: StorageMode): FakeStorage {
  const data = new Map<string, string>();
  const fail = (): never => {
    throw new Error("storage failure");
  };
  return {
    getItem: (key) => (mode === "throwGet" || mode === "throwBoth" ? fail() : (data.get(key) ?? null)),
    setItem: (key, value) => {
      if (mode === "throwSet" || mode === "throwBoth") fail();
      data.set(key, value);
    },
  };
}

function stubEnvironment(mode: StorageMode): void {
  if (mode === "noWindow") {
    vi.stubGlobal("window", undefined);
  } else if (mode === "missing") {
    vi.stubGlobal("window", {});
  } else {
    vi.stubGlobal("window", { localStorage: buildStorage(mode) });
  }
}

const modeArb = fc.constantFrom<StorageMode>(
  "ok",
  "throwGet",
  "throwSet",
  "throwBoth",
  "missing",
  "noWindow",
);
const appKeyArb = fc.constantFrom<"necro" | "infra">("necro", "infra");
const opsArb = fc.array(fc.constantFrom<"get" | "mark">("get", "mark"), { maxLength: 8 });

describe("tourStorage failures (PBT)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Property 7: Tour_Storage failures never throw and never crash.
   * **Validates: Requirements 15.1, 15.2, 15.6**
   */
  it("hasSeenTour and markTourSeen never throw under any storage failure combination", () => {
    fc.assert(
      fc.property(modeArb, appKeyArb, opsArb, (mode, appKey, ops) => {
        stubEnvironment(mode);
        try {
          for (const op of ops) {
            if (op === "get") {
              expect(() => hasSeenTour(appKey)).not.toThrow();
              expect(typeof hasSeenTour(appKey)).toBe("boolean");
            } else {
              expect(() => markTourSeen(appKey)).not.toThrow();
            }
          }
        } finally {
          vi.unstubAllGlobals();
        }
      }),
      { numRuns: 100 },
    );
  });
});
