// @vitest-environment jsdom
/**
 * Unit tests for useAdapterLoader.
 *
 * **Validates: Requirements 1.1, 1.2, 1.4, 1.5**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CyberCityLayout } from "../../adapter.ts";
import { useAdapterLoader, type AdapterLoader } from "../useAdapterLoader.ts";

// --- React act environment ---
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Mocked adapter module ---
const mocks = vi.hoisted(() => ({ createInfraShieldAdapter: vi.fn() }));
const ADAPTER_PATH = "../../adapter.ts";
function mockWorkingImport(): void {
  vi.doMock(ADAPTER_PATH, () => ({ createInfraShieldAdapter: mocks.createInfraShieldAdapter }));
}
function mockFailingImport(message: string): void {
  vi.doMock(ADAPTER_PATH, () => {
    throw new Error(message);
  });
}

// --- Fixtures ---
const layoutOf = (id: string): CyberCityLayout =>
  ({ nodes: [{ id }], edges: [] }) as unknown as CyberCityLayout;

// --- Hook harness ---
interface Harness {
  readonly current: () => AdapterLoader;
  readonly unmount: () => void;
}
function mountLoader(): Harness {
  let latest: AdapterLoader | null = null;
  function Probe() {
    latest = useAdapterLoader();
    return null;
  }
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  act(() => root.render(<Probe />));
  return {
    current: () => {
      if (latest === null) throw new Error("hook not rendered");
      return latest;
    },
    unmount: () => act(() => root.unmount()),
  };
}

let harness: Harness | null = null;

// Polls until the loader leaves "loading" (or the timeout elapses).
async function settle(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (harness?.current().state.status === "loading" && Date.now() < deadline) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    });
  }
}

beforeEach(() => {
  mocks.createInfraShieldAdapter.mockReset();
  vi.resetModules();
  mockWorkingImport();
});

afterEach(() => {
  harness?.unmount();
  harness = null;
});

describe("useAdapterLoader", () => {
  it("reaches ready with the sample layout", async () => {
    const layout = layoutOf("a");
    const adapter = { loadSampleRepository: vi.fn().mockResolvedValue(layout) };
    mocks.createInfraShieldAdapter.mockReturnValue(adapter);

    harness = mountLoader();
    expect(harness.current().state.status).toBe("loading");
    await settle();

    expect(harness.current().state).toEqual({ status: "ready", adapter, layout });
    expect(mocks.createInfraShieldAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.loadSampleRepository).toHaveBeenCalledTimes(1);
  });

  it("reaches error when the dynamic import rejects", async () => {
    mockFailingImport("import failed");
    harness = mountLoader();
    await settle();

    const state = harness.current().state;
    expect(state.status).toBe("error");
    expect(state).toMatchObject({ message: expect.stringMatching(/\S/) });
    expect(mocks.createInfraShieldAdapter).not.toHaveBeenCalled();
  });

  it("reaches error when createInfraShieldAdapter throws", async () => {
    mocks.createInfraShieldAdapter.mockImplementation(() => {
      throw new Error("create failed");
    });
    harness = mountLoader();
    await settle();
    expect(harness.current().state).toEqual({ status: "error", message: "create failed" });
  });

  it("reaches error when loadSampleRepository rejects", async () => {
    mocks.createInfraShieldAdapter.mockReturnValue({
      loadSampleRepository: vi.fn().mockRejectedValue(new Error("load failed")),
    });
    harness = mountLoader();
    await settle();
    expect(harness.current().state).toEqual({ status: "error", message: "load failed" });
  });

  it("retry returns to loading and repeats create and load", async () => {
    const layout = layoutOf("b");
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(layout);
    mocks.createInfraShieldAdapter.mockReturnValue({ loadSampleRepository: load });

    harness = mountLoader();
    await settle();
    expect(harness.current().state.status).toBe("error");

    act(() => harness?.current().retry());
    expect(harness.current().state.status).toBe("loading");
    await settle();

    expect(mocks.createInfraShieldAdapter).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(harness.current().state).toMatchObject({ status: "ready", layout });
  });

  it("retry after an import failure attempts the import again", async () => {
    mockFailingImport("import failed");
    harness = mountLoader();
    await settle();
    expect(harness.current().state.status).toBe("error");

    const layout = layoutOf("c");
    vi.resetModules();
    mockWorkingImport();
    mocks.createInfraShieldAdapter.mockReturnValue({
      loadSampleRepository: vi.fn().mockResolvedValue(layout),
    });
    act(() => harness?.current().retry());
    await settle();
    expect(harness.current().state).toMatchObject({ status: "ready", layout });
  });
});
