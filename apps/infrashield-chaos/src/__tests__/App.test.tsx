// @vitest-environment jsdom
/**
 * Unit tests for App with a mocked adapter and a stubbed scene.
 *
 * **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 7.9**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CityNode, CyberCityLayout, SREDashboardData } from "../adapter.ts";

// --- React act environment ---
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Scene stub (WebGL is not available in jsdom) ---
vi.mock("../components/city/CyberCityScene.tsx", async () => {
  const { createElement } = await import("react");
  interface StubProps {
    readonly layout: CyberCityLayout;
    readonly selectedId?: string | null;
    readonly onSelect?: (id: string) => void;
  }
  return {
    CyberCityScene: ({ layout, selectedId, onSelect }: StubProps) =>
      createElement(
        "div",
        {
          "data-testid": "scene",
          "data-fault": layout.activeFault?.targetFunctionId ?? "",
          "data-selected": selectedId ?? "",
          "data-nodes": layout.nodes.map((n) => n.id).join(","),
        },
        layout.nodes.map((n) =>
          createElement("button", { key: n.id, onClick: () => onSelect?.(n.id) }, `select ${n.id}`)
        )
      ),
  };
});

// --- Mocked adapter module ---
const mocks = vi.hoisted(() => ({ createInfraShieldAdapter: vi.fn() }));
const ADAPTER_PATH = "../adapter.ts";

// --- Fixtures ---
type Fault = NonNullable<CyberCityLayout["activeFault"]>;
type Patch = NonNullable<SREDashboardData["lastPatch"]>;

const nodeOf = (id: string, centralityScore: number): CityNode => ({
  id, name: id, filePath: `${id}.ts`, complexity: 2, isFaulted: false, isAffected: false, centralityScore,
});
const NODES = [nodeOf("n1", 0.1), nodeOf("n2", 0.9), nodeOf("n3", 0.5)];
const HEALTHY: CyberCityLayout = {
  nodes: NODES, edges: [], activeBlastRadius: null, activeFault: null, securityFindings: [],
};
const faultOf = (targetFunctionId: string): Fault => ({
  targetFunctionId, faultType: "UNCAUGHT_EXCEPTION", affectedNodes: [], cascadePath: [],
  taintPaths: [], centralityScore: 0.5, blastRadiusScore: 0.5, durationMs: 1,
});
const layoutWithFault = (id: string): CyberCityLayout => ({ ...HEALTHY, activeFault: faultOf(id) });
const PATCH: Patch = {
  mutationId: "m1", targetFunctionId: "n2", rationale: "rule-based", confidence: 1,
  modelId: "deterministic", durationMs: 1,
  suggestedSplices: [{ filePath: "n2.ts", startIndex: 0, endIndex: 1, replacement: "x", description: "fix" }],
};

// --- Fake adapter ---
function createFake() {
  const state: { fault: Fault | null; patch: Patch | null } = { fault: null, patch: null };
  let current: CyberCityLayout = HEALTHY;
  const fake = {
    loadSampleRepository: vi.fn(async () => HEALTHY),
    injectFault: vi.fn(async (request: { targetFunctionId: string }) => {
      current = layoutWithFault(request.targetFunctionId);
      state.fault = current.activeFault;
      state.patch = PATCH;
      return current;
    }),
    reset: vi.fn(async () => {
      current = HEALTHY;
      state.fault = null;
      state.patch = null;
      return HEALTHY;
    }),
    applyMutation: vi.fn(async () => undefined),
    rollbackLastMutation: vi.fn(async () => undefined),
    getLayout: vi.fn(() => current),
    getSREDashboard: vi.fn((): SREDashboardData => ({
      totalFunctions: 3, totalEdges: 0, totalCircularDeps: 0, avgComplexity: 2, maxComplexity: 2,
      criticalFindings: 0, highFindings: 0, lastFault: state.fault, lastPatch: state.patch,
    })),
    generateBugfixSpec: vi.fn(),
    generateBugfixFile: vi.fn(),
  };
  return fake;
}

// --- Harness ---
let root: Root | null = null;
let container: HTMLElement;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  });
}

async function mountApp(): Promise<void> {
  const { default: App } = await import("../App.tsx");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<App />));
  await settle();
}

function buttonOf(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
  if (found === undefined) throw new Error(`button not found: ${label}`);
  return found;
}

async function click(label: string): Promise<void> {
  await act(async () => buttonOf(label).click());
  await settle();
}

const scene = (): HTMLElement => {
  const el = container.querySelector<HTMLElement>('[data-testid="scene"]');
  if (el === null) throw new Error("scene not rendered");
  return el;
};
const alertText = (): string | null => container.querySelector('[role="alert"]')?.textContent ?? null;

beforeEach(() => {
  vi.resetModules();
  mocks.createInfraShieldAdapter.mockReset();
  vi.doMock(ADAPTER_PATH, () => ({ createInfraShieldAdapter: mocks.createInfraShieldAdapter }));
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("App", () => {
  it("inject success uses the highest-centrality default target and updates the layout", async () => {
    const fake = createFake();
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();
    expect(scene().dataset.fault).toBe("");

    await click("Inject Fault");

    expect(fake.injectFault).toHaveBeenCalledWith({ targetFunctionId: "n2", faultType: "UNCAUGHT_EXCEPTION" });
    expect(scene().dataset.fault).toBe("n2");
    expect(alertText()).toBeNull();
    expect(buttonOf("Reset City")).toBeDefined();
  });

  it("injects into the selected node when one is selected", async () => {
    const fake = createFake();
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();

    await click("select n1");
    expect(scene().dataset.selected).toBe("n1");
    await click("Inject Fault");

    expect(fake.injectFault).toHaveBeenCalledWith({ targetFunctionId: "n1", faultType: "UNCAUGHT_EXCEPTION" });
  });

  it("inject failure keeps the layout and shows the error", async () => {
    const fake = createFake();
    fake.injectFault.mockRejectedValueOnce(new Error("inject boom"));
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();

    await click("Inject Fault");

    expect(alertText()).toContain("inject boom");
    expect(scene().dataset.fault).toBe("");
    expect(scene().dataset.nodes).toBe("n1,n2,n3");
    expect(buttonOf("Inject Fault")).toBeDefined();
  });

  it("reset clears the fault, the patch and the selection", async () => {
    const fake = createFake();
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();
    await click("select n1");
    await click("Inject Fault");
    expect(container.textContent).toContain("Patch Controller");
    expect(scene().dataset.selected).toBe("n1");

    await click("Reset City");

    expect(fake.reset).toHaveBeenCalledTimes(1);
    expect(scene().dataset.fault).toBe("");
    expect(scene().dataset.selected).toBe("");
    expect(container.textContent).not.toContain("Patch Controller");
    expect(buttonOf("Inject Fault")).toBeDefined();
  });

  it("apply failure keeps the layout and shows the error", async () => {
    const fake = createFake();
    fake.applyMutation.mockRejectedValueOnce(new Error("apply boom"));
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();
    await click("Inject Fault");

    await click("Apply Patch");

    expect(alertText()).toContain("apply boom");
    expect(scene().dataset.fault).toBe("n2");
    expect(buttonOf("Rollback").disabled).toBe(true);
    expect(buttonOf("Apply Patch").disabled).toBe(false);
  });

  it("rollback failure keeps the layout and shows the error", async () => {
    const fake = createFake();
    fake.rollbackLastMutation.mockRejectedValueOnce(new Error("rollback boom"));
    mocks.createInfraShieldAdapter.mockReturnValue(fake);
    await mountApp();
    await click("Inject Fault");
    await click("Apply Patch");
    expect(buttonOf("Rollback").disabled).toBe(false);

    await click("Rollback");

    expect(alertText()).toContain("rollback boom");
    expect(scene().dataset.fault).toBe("n2");
    expect(buttonOf("Rollback").disabled).toBe(false);
  });

  it("goes loading, error, Retry, ready", async () => {
    const fake = createFake();
    fake.loadSampleRepository.mockRejectedValueOnce(new Error("load boom"));
    mocks.createInfraShieldAdapter.mockReturnValue(fake);

    const { default: App } = await import("../App.tsx");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<App />));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await settle();

    expect(alertText()).toContain("load boom");
    expect(container.querySelector('[data-testid="scene"]')).toBeNull();

    await click("Retry");

    expect(fake.loadSampleRepository).toHaveBeenCalledTimes(2);
    expect(scene().dataset.nodes).toBe("n1,n2,n3");
    expect(alertText()).toBeNull();
  });
});
