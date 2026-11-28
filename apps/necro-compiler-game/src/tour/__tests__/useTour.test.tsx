// @vitest-environment jsdom
/**
 * useTour behaviour: first visit, dismissal, persistence, replay, storage failure, deferral.
 *
 * **Validates: Requirements 9.1, 9.5, 12.2, 14.3, 14.4**
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTour } from "../useTour";
import { hasSeenTour } from "../tourStorage";

// --- Stub storage (Node's localStorage may shadow jsdom's) ---
function stubStorage(overrides: Partial<Storage> = {}): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    ...overrides,
  });
  return data;
}

const opts = { hasRepoParam: false, loadSummaryOpen: false };

describe("useTour", () => {
  beforeEach(() => {
    stubStorage();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the tour on first visit at step 1", () => {
    const { result } = renderHook(() => useTour("necro", opts));
    expect(result.current.state.visible).toBe(true);
    expect(result.current.state.step).toBe(1);
  });

  it("does not show the tour once seen", () => {
    stubStorage().set("morpheus-tour-seen-necro", "1");
    const { result } = renderHook(() => useTour("necro", opts));
    expect(result.current.state.visible).toBe(false);
  });

  it("Esc dismisses and persists hasSeenTour", () => {
    const { result } = renderHook(() => useTour("necro", opts));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.state.visible).toBe(false);
    expect(hasSeenTour()).toBe(true);
  });

  it("Skip dismisses and persists", () => {
    const { result } = renderHook(() => useTour("necro", opts));
    act(() => result.current.skip());
    expect(result.current.state.visible).toBe(false);
    expect(hasSeenTour()).toBe(true);
  });

  it("replay restarts at step 1 even after the tour was seen", () => {
    const { result } = renderHook(() => useTour("necro", opts));
    act(() => result.current.next());
    act(() => result.current.skip());
    expect(hasSeenTour()).toBe(true);
    act(() => result.current.replay());
    expect(result.current.state.visible).toBe(true);
    expect(result.current.state.step).toBe(1);
  });

  it("does not crash when storage throws", () => {
    const fail = (): never => {
      throw new Error("denied");
    };
    stubStorage({ getItem: fail, setItem: fail });
    const { result } = renderHook(() => useTour("necro", opts));
    expect(result.current.state.visible).toBe(true);
    expect(() => act(() => result.current.skip())).not.toThrow();
    expect(result.current.state.visible).toBe(false);
  });

  it("defers display while repo param is set and load summary is open", () => {
    const { result, rerender } = renderHook(
      (props: { open: boolean }) => useTour("necro", { hasRepoParam: true, loadSummaryOpen: props.open }),
      { initialProps: { open: true } },
    );
    expect(result.current.state.visible).toBe(false);
    rerender({ open: false });
    expect(result.current.state.visible).toBe(true);
  });
});
