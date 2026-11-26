// @vitest-environment jsdom
/**
 * Render tests for LoadingScreen and ErrorPanel.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorPanel } from "../ErrorPanel.tsx";
import { LoadingScreen } from "../LoadingScreen.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Helpers ---
let container: HTMLDivElement;
let root: Root;

function render(element: ReactElement): void {
  act(() => root.render(element));
}

beforeEach(() => {
  // jsdom does not implement matchMedia
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("LoadingScreen", () => {
  it("renders the loading message", () => {
    render(<LoadingScreen />);
    expect(container.textContent).toContain("Loading topology graph...");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe("ErrorPanel", () => {
  it("shows the message inside an alert", () => {
    render(<ErrorPanel message="boom: adapter failed" onRetry={() => undefined} />);
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("boom: adapter failed");
  });

  it("calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorPanel message="x" onRetry={onRetry} />);
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retry");
    expect(button).toBeDefined();
    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
