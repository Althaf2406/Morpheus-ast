// @vitest-environment jsdom
/** Unit tests for LoadingScreen (REQ 2.2, 2.5) and ErrorPanel (REQ 3.2). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LoadingScreen } from "../LoadingScreen.tsx";
import { ErrorPanel } from "../ErrorPanel.tsx";

const stubReducedMotion = (matches: boolean): void => {
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoadingScreen", () => {
  it("shows the loading text", () => {
    stubReducedMotion(false);
    render(<LoadingScreen />);
    expect(screen.getByText("Summoning the dungeon...")).toBeTruthy();
  });

  it("animates when reduced motion is not requested", () => {
    stubReducedMotion(false);
    render(<LoadingScreen />);
    expect(screen.getByText("Summoning the dungeon...").className).toContain("hud-loading__text--pulse");
  });

  it("omits the animation class when reduced motion matches", () => {
    stubReducedMotion(true);
    render(<LoadingScreen />);
    expect(screen.getByText("Summoning the dungeon...").className).not.toContain("hud-loading__text--pulse");
  });
});

describe("ErrorPanel", () => {
  it("shows the message in an alert region", () => {
    render(<ErrorPanel message="boom" onRetry={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("boom");
  });

  it("calls onRetry once when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorPanel message="boom" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
