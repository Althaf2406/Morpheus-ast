// @vitest-environment jsdom
/**
 * Unit tests for useTour.
 * Validates: Requirements 9.1, 9.5, 12.2, 15.3, 15.5
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTour } from "../useTour";
import type { UseTourOptions, UseTourResult } from "../useTour";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// --- Fixtures ---
const KEY = "morpheus-tour-seen-infra";
let data: Map<string, string>;
let host: HTMLElement;
let root: Root;
let latest: UseTourResult;
function installStorage(overrides: Partial<Storage> = {}): void {
  data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      data.set(k, v);
    },
    ...overrides,
  });
}
function Harness(props: UseTourOptions) {
  latest = useTour("infra", props);
  return null;
}
function mount(options: UseTourOptions = { hasRepoParam: false, loadSummaryOpen: false }): void {
  act(() => root.render(<Harness {...options} />));
}
describe("useTour", () => {
  beforeEach(() => {
    installStorage();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  it("shows the tour on first visit at step 1", () => {
    mount();
    expect(latest.state).toEqual({ visible: true, step: 1 });
  });
  it("stays hidden when already seen", () => {
    data.set(KEY, "1");
    mount();
    expect(latest.state.visible).toBe(false);
  });
  it("Esc dismisses and persists", () => {
    mount();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(latest.state.visible).toBe(false);
    expect(data.get(KEY)).toBe("1");
  });
  it("Skip persists", () => {
    mount();
    act(() => latest.skip());
    expect(latest.state.visible).toBe(false);
    expect(data.get(KEY)).toBe("1");
  });
  it("replay restarts at step 1 even after seen", () => {
    data.set(KEY, "1");
    mount();
    act(() => latest.replay());
    expect(latest.state).toEqual({ visible: true, step: 1 });
    act(() => latest.next());
    act(() => latest.replay());
    expect(latest.state).toEqual({ visible: true, step: 1 });
  });
  it("does not crash when localStorage throws", () => {
    const boom = (): never => {
      throw new Error("denied");
    };
    installStorage({ getItem: boom, setItem: boom });
    mount();
    expect(latest.state).toEqual({ visible: true, step: 1 });
    act(() => latest.skip());
    expect(latest.state.visible).toBe(false);
  });
  it("defers display while repo param and load summary are open", () => {
    mount({ hasRepoParam: true, loadSummaryOpen: true });
    expect(latest.state.visible).toBe(false);
    mount({ hasRepoParam: true, loadSummaryOpen: false });
    expect(latest.state.visible).toBe(true);
  });
});
