// @vitest-environment jsdom
/**
 * Each wired Necro event triggers exactly one call to its mapped engine method.
 *
 * **Validates: Requirements 8.4**
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadOutcome } from "../../adapter.ts";
import { useLoadDialog } from "../../hud/load/useLoadDialog.ts";
import { useSpellGame } from "../useSpellGame.ts";
import { caster, layout } from "./wiringFixtures.ts";

const spies = vi.hoisted(() => ({
  playSelect: vi.fn(),
  playCast: vi.fn(),
  playPurify: vi.fn(),
  playUndo: vi.fn(),
  playDenied: vi.fn(),
  playLoadComplete: vi.fn(),
}));

vi.mock("../../audio", () => ({ getAudioEngine: () => spies }));

/** Names of spies that were called, with their call counts. */
const calls = (): Record<string, number> =>
  Object.fromEntries(
    Object.entries(spies)
      .map(([name, spy]) => [name, spy.mock.calls.length] as const)
      .filter(([, count]) => count > 0),
  );

describe("Necro event wiring", () => {
  beforeEach(() => Object.values(spies).forEach((spy) => spy.mockClear()));

  it("select plays one select sound, and deselect plays none", () => {
    const { result } = renderHook(() => useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    expect(calls()).toEqual({ playSelect: 1 });
    act(() => result.current.select(null));
    expect(calls()).toEqual({ playSelect: 1 });
  });

  it("a successful cast plays exactly one cast and one purify sound", async () => {
    const { result } = renderHook(() => useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    spies.playSelect.mockClear();
    await act(async () => result.current.cast());
    expect(calls()).toEqual({ playCast: 1, playPurify: 1 });
  });

  it("a failed cast plays no cast or purify sound", async () => {
    const failing = { ...caster(), castSpell: () => Promise.reject(new Error("fizzle")) };
    const { result } = renderHook(() => useSpellGame(layout, failing));
    act(() => result.current.select("curable"));
    spies.playSelect.mockClear();
    await act(async () => result.current.cast());
    expect(calls()).toEqual({});
  });

  it("undo plays exactly one undo sound", async () => {
    const { result } = renderHook(() => useSpellGame(layout, caster()));
    act(() => result.current.select("curable"));
    await act(async () => result.current.cast());
    Object.values(spies).forEach((spy) => spy.mockClear());
    await act(async () => result.current.undo());
    expect(calls()).toEqual({ playUndo: 1 });
  });

  it("casting on an immune monster plays exactly one denied sound", async () => {
    const { result } = renderHook(() => useSpellGame(layout, caster()));
    act(() => result.current.select("immune"));
    spies.playSelect.mockClear();
    await act(async () => result.current.cast());
    expect(calls()).toEqual({ playDenied: 1 });
  });

  it("a successful load plays one load sound; a failed load plays none", async () => {
    const { result } = renderHook(() => useLoadDialog());
    const ok = { ok: true } as unknown as LoadOutcome;
    const bad = { ok: false, message: "no" } as unknown as LoadOutcome;
    await act(async () => result.current.run(async () => bad));
    expect(calls()).toEqual({});
    await act(async () => result.current.run(async () => ok));
    expect(calls()).toEqual({ playLoadComplete: 1 });
  });
});
