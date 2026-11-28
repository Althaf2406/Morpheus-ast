// @vitest-environment jsdom
/**
 * Mute persistence, "M" shortcut and MuteToggle behaviour.
 *
 * **Validates: Requirements 8.1, 8.3**
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAudioEngine } from "../engine";
import { MuteToggle } from "../MuteToggle";
import { createMuteStore, STORAGE_KEY } from "../muteStore";
import { useAudioEngine } from "../useAudioEngine";

function Harness() {
  useAudioEngine();
  return (
    <div>
      <MuteToggle />
      <input aria-label="text" />
    </div>
  );
}

const button = (): HTMLElement => screen.getByRole("button");

describe("mute persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("writes the state to localStorage and restores it in a new store", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    });
    createMuteStore().set(true);
    expect(data.get(STORAGE_KEY)).toBe("true");
    expect(createMuteStore().value).toBe(true);
    createMuteStore().set(false);
    expect(data.get(STORAGE_KEY)).toBe("false");
    expect(createMuteStore().value).toBe(false);
  });
});

describe("mute controls", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    const engine = getAudioEngine();
    if (engine.isMuted) engine.toggleMute();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("click toggles state and flips aria-pressed and the label", () => {
    render(<Harness />);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Mute sound");
    fireEvent.click(button());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Unmute sound");
  });

  it("the M key toggles mute", () => {
    render(<Harness />);
    act(() => void fireEvent.keyDown(document.body, { key: "m" }));
    expect(button().getAttribute("aria-pressed")).toBe("true");
    act(() => void fireEvent.keyDown(document.body, { key: "M" }));
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("the M key is ignored while a text input has focus", () => {
    render(<Harness />);
    const input = screen.getByLabelText("text");
    input.focus();
    fireEvent.keyDown(input, { key: "m" });
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });
});
