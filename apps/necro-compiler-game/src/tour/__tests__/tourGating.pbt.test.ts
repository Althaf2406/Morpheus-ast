// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fc from "fast-check";
import { renderHook } from "@testing-library/react";
import { useTour } from "../useTour";

const SEEN_KEY = "morpheus-tour-seen-necro";

function stubStorage(seen: boolean): void {
  const store = new Map<string, string>();
  if (seen) store.set(SEEN_KEY, "1");
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

describe("Property 6: Automatic display gating", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** **Validates: Requirements 9.1, 13.1, 13.2, 15.3** */
  it("auto-shows iff !seen && !(hasRepoParam && loadSummaryOpen)", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (seen, hasRepoParam, loadSummaryOpen) => {
        stubStorage(seen);
        const { result, unmount } = renderHook(() =>
          useTour("necro", { hasRepoParam, loadSummaryOpen }),
        );
        const visible = result.current.state.visible;
        unmount();
        expect(visible).toBe(!seen && !(hasRepoParam && loadSummaryOpen));
      }),
      { numRuns: 100 },
    );
  });
});
