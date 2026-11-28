/**
 * Property 7: storage failures never propagate.
 * **Validates: Requirements 15.1, 15.2, 15.6**
 */
import { afterEach, describe, it, vi } from "vitest";
import * as fc from "fast-check";
import { hasSeenTour, markTourSeen } from "../tourStorage";
import type { TourAppKey } from "../tourStorage";

// --- Generators ---
type Failure = "none" | "throw" | "missing";

const failureArb = fc.constantFrom<Failure>("none", "throw", "missing");
const thrownArb = fc.oneof(
  fc.string().map((m) => new Error(m)),
  fc.string(),
  fc.constant(undefined),
);
const appKeyArb = fc.constantFrom<TourAppKey>("necro", "infra");
const windowModeArb = fc.constantFrom("present", "noStorage", "undefinedWindow", "throwingGetter");

// --- Helpers ---
function method(mode: Failure, thrown: unknown, ok: unknown): unknown {
  if (mode === "throw") {
    return () => {
      throw thrown;
    };
  }
  return mode === "missing" ? undefined : ok;
}

function installWindow(
  windowMode: string,
  getMode: Failure,
  setMode: Failure,
  thrown: unknown,
): void {
  const storage = {
    getItem: method(getMode, thrown, () => null),
    setItem: method(setMode, thrown, () => undefined),
  };
  if (windowMode === "undefinedWindow") {
    vi.stubGlobal("window", undefined);
  } else if (windowMode === "noStorage") {
    vi.stubGlobal("window", {});
  } else if (windowMode === "throwingGetter") {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw thrown;
      },
    });
  } else {
    vi.stubGlobal("window", { localStorage: storage });
  }
}

describe("tourStorage failure handling (Property 7)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hasSeenTour and markTourSeen never throw under any storage failure", () => {
    fc.assert(
      fc.property(
        windowModeArb,
        failureArb,
        failureArb,
        thrownArb,
        appKeyArb,
        (windowMode, getMode, setMode, thrown, appKey) => {
          installWindow(windowMode, getMode, setMode, thrown);
          try {
            const seen = hasSeenTour(appKey);
            markTourSeen(appKey);
            return typeof seen === "boolean";
          } finally {
            vi.unstubAllGlobals();
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
