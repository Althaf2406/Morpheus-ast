// @vitest-environment jsdom
/**
 * Tests for the M key shortcut and the MuteToggle button.
 *
 * **Validates: Requirements 8.3**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMemoryStorage } from "./memoryStorage";
import { getAudioEngine, MuteToggle, useAudioEngine } from "../index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const { muted, toggleMute } = useAudioEngine();
  return <MuteToggle muted={muted} onToggle={toggleMute} />;
}

let container: HTMLDivElement;
let root: Root;
let data: Map<string, string>;

beforeEach(() => {
  data = installMemoryStorage();
  const engine = getAudioEngine();
  if (engine.isMuted) engine.toggleMute();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function pressM(target: EventTarget = document.body): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));
  });
}

function button(): HTMLButtonElement {
  return container.querySelector("button") as HTMLButtonElement;
}

describe("MuteToggle and M key", () => {
  it("starts unmuted with aria-pressed=false", () => {
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().getAttribute("aria-label")).toBe("Mute sound");
  });

  it("click toggles state and flips aria-pressed", () => {
    act(() => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(button().getAttribute("aria-label")).toBe("Unmute sound");
    act(() => button().click());
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });

  it("M key toggles mute", () => {
    pressM();
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(data.get("infrashield-chaos.muted")).toBe("true");
  });

  it("M key is ignored while an input is focused", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressM(input);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    input.remove();
  });
});
