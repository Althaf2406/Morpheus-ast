// @vitest-environment jsdom
/**
 * Repo_Param behaviour through App with a mocked adapter and a stubbed scene.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.8**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CyberCityLayout, LoadOutcome } from "../adapter.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// --- Scene stub (WebGL is not available in jsdom) ---
vi.mock("../components/city/CyberCityScene.tsx", async () => {
  const { createElement } = await import("react");
  return {
    CyberCityScene: ({ layout }: { readonly layout: CyberCityLayout }) =>
      createElement("div", { "data-testid": "scene", "data-nodes": layout.nodes.length }),
  };
});

// --- Mocked adapter module ---
const mocks = vi.hoisted(() => ({ createInfraShieldAdapter: vi.fn() }));

// --- Fixtures ---
const layoutOf = (count: number): CyberCityLayout => ({
  nodes: Array.from({ length: count }, (_, i) => ({
    id: `n${i}`, name: `n${i}`, filePath: "a.ts", complexity: 1, isFaulted: false, isAffected: false, centralityScore: 0.1,
  })),
  edges: [], activeBlastRadius: null, activeFault: null, securityFindings: [],
});
const SAMPLE = layoutOf(1);
const LOADED = layoutOf(3);
const REF = /^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)$/;
const success = (): LoadOutcome =>
  ({ ok: true, layout: LOADED, summary: {}, filesAnalyzed: 1, findingsCount: 0, skipped: [] }) as unknown as LoadOutcome;
const failure = (): LoadOutcome => ({ ok: false, message: "GitHub said no" }) as unknown as LoadOutcome;

function createFake(outcome: () => LoadOutcome) {
  let loaded = false;
  return {
    loadSampleRepository: vi.fn(async () => SAMPLE),    parseRepositoryRef: vi.fn((value: string) => {
      const m = REF.exec(value);
      return m === null ? null : { owner: m[1], name: m[2] };
    }),
    loadFromGitHub: vi.fn(async (ref: string) => {
      if (!REF.test(ref)) return { ok: false, message: "Use owner/name, for example octocat/hello-world." } as unknown as LoadOutcome;
      const result = outcome();
      loaded = result.ok;
      return result;
    }),
    backToSample: vi.fn(async () => { loaded = false; return SAMPLE; }),
    isLoadedRepositoryActive: vi.fn(() => loaded),
    loadFromCandidates: vi.fn(),
    getLayout: vi.fn(() => SAMPLE),
    getSREDashboard: vi.fn(() => ({ totalFunctions: 1, totalEdges: 0, totalCircularDeps: 0, avgComplexity: 1, maxComplexity: 1, criticalFindings: 0, highFindings: 0, lastFault: null, lastPatch: null })),
  };
}

// --- Harness ---
let root: Root | null = null;
let container: HTMLElement;

const settle = (): Promise<void> => act(async () => { await new Promise<void>((r) => setTimeout(r, 30)); });

async function mountApp(fake: ReturnType<typeof createFake>, search: string): Promise<void> {
  window.history.replaceState(null, "", `/${search}`);
  mocks.createInfraShieldAdapter.mockReturnValue(fake);
  const { default: App } = await import("../App.tsx");
  container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  act(() => root?.render(<App />));
  await settle();
}

const buttonOf = (label: string): HTMLButtonElement => {
  const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
  if (found === undefined) throw new Error(`button not found: ${label}`);
  return found;
};
const nodes = (): string | undefined => container.querySelector<HTMLElement>('[data-testid="scene"]')?.dataset.nodes;
const alertText = (): string => container.querySelector('[role="alert"]')?.textContent ?? "";

beforeEach(() => {
  vi.resetModules();
  mocks.createInfraShieldAdapter.mockReset();
  vi.doMock("../adapter.ts", () => ({ createInfraShieldAdapter: mocks.createInfraShieldAdapter }));
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
});

afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

describe("Repo_Param", () => {
  it("a valid ?repo opens the GitHub tab pre-filled, loads it and writes the address bar", async () => {
    const fake = createFake(success);
    let release: (outcome: LoadOutcome) => void = () => undefined;
    fake.loadFromGitHub.mockImplementationOnce(() => new Promise<LoadOutcome>((resolve) => { release = resolve; }));
    await mountApp(fake, "?repo=https://github.com/octocat/hello-world");

    // While the link-triggered load is in flight the dialog shows the pre-filled GitHub tab.
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("GitHub");
    expect(container.querySelector<HTMLInputElement>('[role="tabpanel"]:not([hidden]) input')?.value).toContain("octocat/hello-world");
    await act(async () => release(success()));
    await settle();

    expect(fake.loadFromGitHub).toHaveBeenCalledTimes(1);
    expect(fake.loadFromGitHub).toHaveBeenCalledWith(expect.stringContaining("octocat/hello-world"));
    expect(nodes()).toBe("3");
    expect(window.location.search).toBe("?repo=octocat/hello-world");
  });

  it("an invalid ?repo keeps the sample, shows the format error and opens no dialog", async () => {
    const fake = createFake(success);
    await mountApp(fake, "?repo=not%20a%20repo");

    expect(alertText()).toContain("owner/name");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(nodes()).toBe("1");
    expect(window.location.search).toBe("?repo=not%20a%20repo");
  });

  it("Back to sample repository restores the sample and removes the param", async () => {
    const fake = createFake(success);
    await mountApp(fake, "?repo=octocat/hello-world&x=1");
    expect(window.location.search).toBe("?x=1&repo=octocat/hello-world");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
    await settle();

    await act(async () => buttonOf("Back to sample repository").click());
    await settle();

    expect(nodes()).toBe("1");
    expect(window.location.search).toBe("?x=1");
  });

  it("a failed load keeps the sample and leaves the address bar unchanged", async () => {
    const fake = createFake(failure);
    await mountApp(fake, "?repo=octocat/hello-world");

    expect(fake.loadFromGitHub).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("GitHub said no");
    expect(nodes()).toBe("1");
    expect(window.location.search).toBe("?repo=octocat/hello-world");
  });
});
