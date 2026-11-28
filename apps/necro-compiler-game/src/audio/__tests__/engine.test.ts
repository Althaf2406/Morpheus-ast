// @vitest-environment jsdom
/**
 * Audio engine gesture gate, mute behaviour and master gain, using a Mock_Context.
 *
 * **Validates: Requirements 8.2, 8.5, 8.6, 4.1**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine, MASTER_GAIN } from "../engine";
import { createMuteStore } from "../muteStore";
import { asAudioContext, countKind, createMockContext, type MockContext } from "./mockContext";

function stubStorage(throwing = false): Map<string, string> {
  const data = new Map<string, string>();
  const fail = (): never => {
    throw new Error("storage unavailable");
  };
  vi.stubGlobal("localStorage", {
    getItem: throwing ? fail : (key: string) => data.get(key) ?? null,
    setItem: throwing ? fail : (key: string, value: string) => void data.set(key, value),
  });
  return data;
}

describe("audio engine", () => {
  let mock: MockContext;
  let factory: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mock = createMockContext();
    factory = vi.fn(() => asAudioContext(mock));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("constructs no context before the first gesture, even when effects are requested", () => {
    stubStorage();
    const engine = createAudioEngine(factory, createMuteStore());
    engine.playCast();
    engine.playSelect();
    expect(factory).not.toHaveBeenCalled();
    expect(mock.nodes).toHaveLength(0);
  });

  it("creates one context on the first gesture, reuses it later, with master gain 0.126", () => {
    stubStorage();
    const engine = createAudioEngine(factory, createMuteStore());
    engine.primeOnGesture();
    engine.primeOnGesture();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(mock.resume).toHaveBeenCalledTimes(1);
    expect(mock.nodes[0].kind).toBe("gain");
    expect(mock.nodes[0].gain.value).toBe(MASTER_GAIN);
    expect(MASTER_GAIN).toBeCloseTo(0.126, 3);
  });

  it("creates no oscillator or buffer source for an effect while muted", () => {
    stubStorage().set("necro-compiler.muted", "true");
    const engine = createAudioEngine(factory, createMuteStore());
    engine.primeOnGesture();
    const before = mock.nodes.length;
    engine.playCast();
    engine.playLoadComplete();
    expect(mock.nodes).toHaveLength(before);
    expect(countKind(mock, "oscillator")).toBe(0);
    expect(countKind(mock, "bufferSource")).toBe(0);
  });

  it("creates voices for an effect when unmuted and silences the master when muting", () => {
    stubStorage();
    const engine = createAudioEngine(factory, createMuteStore());
    engine.primeOnGesture();
    const before = countKind(mock, "oscillator");
    engine.playPurify();
    expect(countKind(mock, "oscillator")).toBeGreaterThan(before);
    engine.toggleMute();
    expect(mock.nodes[0].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
  });

  it("is a no-op without throwing when AudioContext is unsupported", () => {
    stubStorage();
    const engine = createAudioEngine(() => null, createMuteStore());
    expect(() => {
      engine.primeOnGesture();
      engine.playCast();
      engine.toggleMute();
      engine.dispose();
    }).not.toThrow();
  });

  it("keeps working in memory when localStorage throws on read and write", () => {
    stubStorage(true);
    const engine = createAudioEngine(factory, createMuteStore());
    expect(engine.isMuted).toBe(false);
    expect(() => engine.toggleMute()).not.toThrow();
    expect(engine.isMuted).toBe(true);
  });
  it("swallows errors thrown while building an effect", () => {
    stubStorage();
    const engine = createAudioEngine(factory, createMuteStore());
    engine.primeOnGesture();
    mock.createOscillator = () => {
      throw new Error("boom");
    };
    expect(() => engine.playLoadComplete()).not.toThrow();
  });
});
