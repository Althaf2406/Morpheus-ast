// @vitest-environment jsdom
/**
 * With the real engine and a Mock_Context, wired events make no sound
 * before the first gesture or while muted, and make sound afterwards.
 *
 * **Validates: Requirements 8.4, 8.5, 8.6**
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asAudioContext, countKind, createMockContext, type MockContext } from "../../audio/__tests__/mockContext.ts";
import { caster, layout } from "./wiringFixtures.ts";

type AudioModule = typeof import("../../audio");
type GameModule = typeof import("../useSpellGame.ts");

interface Harness {
  readonly mock: MockContext;
  readonly constructed: ReturnType<typeof vi.fn>;
  readonly audio: AudioModule;
  readonly game: GameModule;
}

async function setup(stored?: string): Promise<Harness> {
  const mock = createMockContext();
  const constructed = vi.fn();
  const data = new Map<string, string>(stored === undefined ? [] : [["necro-compiler.muted", stored]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  });
  vi.stubGlobal("AudioContext", function MockCtor() {
    constructed();
    return asAudioContext(mock);
  });
  Object.defineProperty(window, "AudioContext", { value: globalThis.AudioContext, configurable: true });
  vi.resetModules();
  return { mock, constructed, audio: await import("../../audio"), game: await import("../useSpellGame.ts") };
}

describe("Necro event wiring gate", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("constructs nothing before the first gesture", async () => {
    const { mock, constructed, game } = await setup();
    const { result } = renderHook(() => game.useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    await act(async () => result.current.cast());
    expect(constructed).not.toHaveBeenCalled();
    expect(mock.nodes).toHaveLength(0);
  });

  it("makes sound for a wired event once a gesture has occurred", async () => {
    const { mock, constructed, audio, game } = await setup();
    audio.getAudioEngine().primeOnGesture();
    const before = countKind(mock, "oscillator");
    const { result } = renderHook(() => game.useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(countKind(mock, "oscillator") + countKind(mock, "bufferSource")).toBeGreaterThan(before);
  });

  it("creates no voices for wired events while muted", async () => {
    const { mock, audio, game } = await setup("true");
    audio.getAudioEngine().primeOnGesture();
    const before = mock.nodes.length;
    const { result } = renderHook(() => game.useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    await act(async () => result.current.cast());
    await act(async () => result.current.undo());
    act(() => result.current.select("immune"));
    await act(async () => result.current.cast());
    expect(mock.nodes).toHaveLength(before);
  });
});
