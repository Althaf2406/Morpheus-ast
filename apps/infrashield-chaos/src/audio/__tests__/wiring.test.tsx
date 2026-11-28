// @vitest-environment jsdom
/** Wiring: one engine call per event; silent before a gesture or when muted; 20-node cascade = 12 ticks.
 * **Validates: Requirements 8.4, 8.5, 8.6, 8.7** */
import * as fc from "fast-check";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CyberCityLayout, InfraShieldAdapter, LoadOutcome } from "../../adapter.ts";
import { BugfixDownloadButton } from "../../components/panels/BugfixDownloadButton.tsx";
import { BugfixSpecButton } from "../../components/panels/BugfixSpecButton.tsx";
import { bugfixSpecArb } from "../../components/panels/__tests__/bugfixSpecArbitraries.ts";
import { makeScene } from "../../components/city/__tests__/faultLayoutArb.ts";
import { buildFaultAnimation } from "../../components/city/useFaultAnimation.ts";
import { useCityController } from "../../hooks/useCityController.ts";
import { useRepoSwitch } from "../../hooks/useRepoSwitch.ts";
import { getAudioEngine, type AudioEngine } from "../index";
import { installMemoryStorage } from "./memoryStorage.ts";
import { MockContext } from "./mockContext.ts";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contexts: MockContext[] = [];
const voices = (): number => contexts.reduce((n, c) => n + c.count("oscillator") + c.count("bufferSource"), 0);
const engine: AudioEngine = getAudioEngine();
const METHODS = ["playFaultAlarm", "playCascadeTick", "playPatchApplied", "playPatchRollback", "playBugfixClick", "playLoadComplete"] as const;
type Method = (typeof METHODS)[number];
const spies = (): Record<Method, ReturnType<typeof vi.spyOn>> =>
  Object.fromEntries(METHODS.map((m) => [m, vi.spyOn(engine, m)])) as Record<Method, ReturnType<typeof vi.spyOn>>;
let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  installMemoryStorage();
  contexts.length = 0;
  vi.stubGlobal("AudioContext", function MockAudioContext() {
    return contexts[contexts.push(new MockContext()) - 1];
  });
  engine.dispose();
  if (engine.isMuted) engine.toggleMute();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountHook<T>(useHook: () => T): { current: T } {
  const result = { current: undefined as unknown as T };
  const Probe = (): null => ((result.current = useHook()), null);
  mountView(createElement(Probe));
  return result;
}
function mountView(view: ReturnType<typeof createElement>): void {
  act(() => root?.unmount());
  root = createRoot(host);
  act(() => root?.render(view));
}

const node = { id: "a", name: "a", filePath: "a.ts", complexity: 1, isFaulted: false, isAffected: false, centralityScore: 0.1 };
const layout: CyberCityLayout = { nodes: [node], edges: [], activeBlastRadius: null, activeFault: null, securityFindings: [] };
const ok = { ok: true, layout, summary: {}, filesAnalyzed: 1, findingsCount: 0, skipped: [] } as unknown as LoadOutcome;
const fakeAdapter = {
  injectFault: async () => layout,
  applyMutation: async () => undefined,
  rollbackLastMutation: async () => undefined,
  reset: async () => layout,
  getLayout: () => layout,
  getSREDashboard: () => ({ lastPatch: { suggestedSplices: [] } }),
  loadFromCandidates: async () => ok,
  isLoadedRepositoryActive: () => false,
} as unknown as InfraShieldAdapter;

// Each scenario triggers one event and names the engine method it must hit once.
const scenarios: ReadonlyArray<readonly [string, Method, () => Promise<void>]> = [
  ["inject", "playFaultAlarm", async () => {
    const c = mountHook(() => useCityController(fakeAdapter, layout));
    await act(async () => c.current.inject());
  }],
  ["apply", "playPatchApplied", async () => {
    const c = mountHook(() => useCityController(fakeAdapter, layout));
    await act(async () => c.current.inject());
    vi.clearAllMocks(); // the setup inject sounded an alarm; only the apply is under test
    await act(async () => c.current.applyPatch());
  }],
  ["rollback", "playPatchRollback", async () => {
    const c = mountHook(() => useCityController(fakeAdapter, layout));
    await act(async () => c.current.rollback());
  }],
  ["load", "playLoadComplete", async () => {
    const r = mountHook(() => useRepoSwitch(fakeAdapter, () => undefined));
    await act(async () => void (await r.current.load([])));
  }],
  ["bugfix generate", "playBugfixClick", async () => {
    const spec = fc.sample(bugfixSpecArb, 1)[0] as ReturnType<InfraShieldAdapter["generateBugfixSpec"]>;
    mountView(createElement(BugfixSpecButton, { adapter: { generateBugfixSpec: () => spec }, isEnabled: true }));
    await act(async () => host.querySelector("button")?.click());
  }],
  ["bugfix download", "playBugfixClick", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const adapter = { generateBugfixFile: () => ({ fileName: "bugfix.md", content: "x" }) };
    mountView(createElement(BugfixDownloadButton, { adapter, isEnabled: true }));
    await act(async () => host.querySelector("button")?.click());
  }],
];

describe("InfraShield sound wiring", () => {
  it.each(scenarios)("%s triggers exactly one %s call", async (_name, method, trigger) => {
    const all = spies();
    act(() => engine.primeOnGesture());
    await trigger();
    expect(all[method]).toHaveBeenCalledTimes(1);
    for (const m of METHODS) if (m !== method) expect(all[m]).not.toHaveBeenCalled();
  });

  it("a 20-node cascade emits exactly 12 cascade ticks", () => {
    const all = spies();
    act(() => engine.primeOnGesture());
    const nodes = Array.from({ length: 20 }, (_, i) => ({ ...node, id: `a${i}`, isAffected: true }));
      const fault = { ...node, id: "f", isFaulted: true };
    const positions = new Map([[fault.id, { x: 0, y: 0, z: 0 }], ...nodes.map((n, i) => [n.id, { x: i, y: 0, z: 0 }] as const)]);
    const handle = buildFaultAnimation({
      nodes: [fault, ...nodes], edges: [], scene: makeScene(), reducedMotion: false,
      positions: positions as never, onCascadeReveal: () => engine.playCascadeTick(),
    });
    for (let t = 0; t < 60; t += 0.05) handle.animateTick(t);
    expect(all.playCascadeTick).toHaveBeenCalledTimes(12);
  });

  it("creates no context and no voices before the first gesture", async () => {
    for (const [, , trigger] of scenarios) await trigger();
    engine.playFaultAlarm();
    expect(contexts).toHaveLength(0);
    expect(voices()).toBe(0);
  });

  it("creates no voices while muted", async () => {
    act(() => engine.primeOnGesture());
    act(() => engine.toggleMute());
    const before = voices();
    for (const [, , trigger] of scenarios) await trigger();
    expect(voices()).toBe(before);
  });
});
