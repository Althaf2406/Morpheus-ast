// @vitest-environment jsdom
/**
 * Unit tests for the InfraShield audio engine and mute persistence.
 *
 * **Validates: Requirements 8.1, 8.2, 8.5, 8.6**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "../engine";
import { createMuteStore, STORAGE_KEY } from "../muteStore";
import { installMemoryStorage, installThrowingStorage } from "./memoryStorage";
import { createMockFactory, type MockContext } from "./mockContext";

let data: Map<string, string>;

beforeEach(() => {
  data = installMemoryStorage();
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const mock = createMockFactory();
  const engine = createAudioEngine({ contextFactory: mock.factory });
  const ctx = (): MockContext => mock.contexts[0] as MockContext;
  return { mock, engine, ctx };
}

function voiceCount(ctx: MockContext): number {
  return ctx.count("oscillator") + ctx.count("bufferSource");
}

describe("mute persistence", () => {
  it("uses the infra Storage_Key and round-trips through localStorage", () => {
    expect(STORAGE_KEY).toBe("infrashield-chaos.muted");
    createMuteStore().set(true);
    expect(data.get(STORAGE_KEY)).toBe("true");
    expect(createMuteStore().value).toBe(true);
    createMuteStore().set(false);
    expect(createMuteStore().value).toBe(false);
  });

  it("keeps working when localStorage getItem and setItem throw", () => {
    installThrowingStorage();
    const { engine } = setup();
    expect(engine.isMuted).toBe(false);
    expect(() => engine.toggleMute()).not.toThrow();
    expect(engine.isMuted).toBe(true);
  });
});

describe("gesture gate", () => {
  it("creates no context before the first gesture and ignores early requests", () => {
    const { mock, engine } = setup();
    engine.playFaultAlarm();
    engine.playLoadComplete();
    expect(mock.contexts).toHaveLength(0);
  });

  it("creates one context with Master_Gain 0.126 and reuses it on later gestures", () => {
    const { mock, engine, ctx } = setup();
    engine.primeOnGesture();
    engine.primeOnGesture();
    expect(mock.contexts).toHaveLength(1);
    const master = ctx().created.indexOf("gain");
    expect(master).toBe(0);
    engine.playPatchApplied();
    expect(voiceCount(ctx())).toBeGreaterThan(0);
  });

  it("is a silent no-op when AudioContext is unsupported", () => {
    const engine = createAudioEngine();
    expect(() => {
      engine.primeOnGesture();
      engine.playFaultAlarm();
    }).not.toThrow();
  });
});

describe("mute behaviour", () => {
  it("creates no oscillator or buffer source while muted", () => {
    data.set(STORAGE_KEY, "true");
    const { engine, ctx } = setup();
    engine.primeOnGesture();
    engine.playFaultAlarm();
    engine.playCascadeTick();
    expect(voiceCount(ctx())).toBe(0);
  });

  it("silences on mute and restores output on unmute", () => {
    const { engine, ctx } = setup();
    engine.primeOnGesture();
    engine.toggleMute();
    const before = voiceCount(ctx());
    engine.playBugfixClick();
    expect(voiceCount(ctx())).toBe(before);
    engine.toggleMute();
    engine.playBugfixClick();
    expect(voiceCount(ctx())).toBeGreaterThan(before);
  });

  it("toggling before the first gesture only stores state", () => {
    const { mock, engine } = setup();
    engine.toggleMute();
    expect(engine.isMuted).toBe(true);
    expect(data.get(STORAGE_KEY)).toBe("true");
    expect(mock.contexts).toHaveLength(0);
  });

  it("dispose closes the context", () => {
    const { engine, ctx } = setup();
    engine.primeOnGesture();
    const first = ctx();
    engine.dispose();
    expect(first.closed).toBe(true);
  });
});
