// @vitest-environment jsdom
/**
 * Property 6: Automatic display gating.
 * **Validates: Requirements 9.1, 13.1, 13.2, 15.3**
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { useTour } from "../useTour";
import type { UseTourResult } from "../useTour";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubStorage(seen: boolean): void {
  const store = new Map<string, string>();
  if (seen) store.set("morpheus-tour-seen-infra", "1");
  vi.stubGlobal("localStorage", {
    getItem: (k: string): string | null => store.get(k) ?? null,
    setItem: (k: string, v: string): void => void store.set(k, v),
    removeItem: (k: string): void => void store.delete(k),
    clear: (): void => store.clear(),
    key: (): string | null => null,
    length: 0,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useTour Property 6: automatic display gating", () => {
  it("auto-shows iff !seen && !(hasRepoParam && loadSummaryOpen)", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (seen, hasRepoParam, loadSummaryOpen) => {
        stubStorage(seen);
        let latest: UseTourResult | undefined;
        const Probe = (): null => {
          latest = useTour("infra", { hasRepoParam, loadSummaryOpen });
          return null;
        };
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        try {
          act(() => {
            root.render(createElement(Probe));
          });
          const expected = !seen && !(hasRepoParam && loadSummaryOpen);
          expect(latest?.state.visible).toBe(expected);
        } finally {
          act(() => root.unmount());
          host.remove();
        }
      }),
      { numRuns: 100 },
    );
  });
});
