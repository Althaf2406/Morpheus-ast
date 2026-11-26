// @vitest-environment jsdom
/**
 * Unit tests for useAdapterLoader.
 *
 * **Validates: Requirements 1.4, 3.1, 3.3, 3.4**
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DungeonLayout } from "../../adapter.ts";
import { useAdapterLoader } from "../useAdapterLoader.ts";

// --- Mocked adapter module ---
const mocks = vi.hoisted(() => ({ createNecroAdapter: vi.fn() }));
const ADAPTER_PATH = "../../adapter.ts";
function mockWorkingImport(): void {
  vi.doMock(ADAPTER_PATH, () => ({ createNecroAdapter: mocks.createNecroAdapter }));
}
function mockFailingImport(message: string): void {
  vi.doMock(ADAPTER_PATH, () => {
    throw new Error(message);
  });
}

// --- Fixtures ---
const layoutOf = (roomId: string): DungeonLayout => ({
  rooms: [
    {
      id: roomId,
      functionName: "f",
      filePath: "a.ts",
      size: "SMALL",
      cyclomaticComplexity: 1,
      isCircularDep: false,
      entities: [],
      corridorIds: [],
    },
  ],
  corridors: [],
  totalEntities: 0,
  bossRoomIds: [],
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.createNecroAdapter.mockReset();
  vi.resetModules();
  mockWorkingImport();
});

describe("useAdapterLoader", () => {
  it("reaches ready with the sample layout and creates the adapter once", async () => {
    const layout = layoutOf("r1");
    const adapter = { loadSampleRepository: vi.fn().mockResolvedValue(layout) };
    mocks.createNecroAdapter.mockReturnValue(adapter);

    const { result } = renderHook(() => useAdapterLoader());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(result.current.state).toEqual({ status: "ready", adapter, layout });
    expect(mocks.createNecroAdapter).toHaveBeenCalledTimes(1);
    expect(adapter.loadSampleRepository).toHaveBeenCalledTimes(1);
  });

  it("reaches error when the dynamic import rejects", async () => {
    mockFailingImport("import failed");
    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).toMatchObject({ message: expect.stringMatching(/\S/) });
    expect(mocks.createNecroAdapter).not.toHaveBeenCalled();
  });

  it("reaches error when createNecroAdapter throws", async () => {
    mocks.createNecroAdapter.mockImplementation(() => {
      throw new Error("create failed");
    });
    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).toEqual({ status: "error", message: "create failed" });
  });

  it("reaches error when loadSampleRepository rejects", async () => {
    mocks.createNecroAdapter.mockReturnValue({
      loadSampleRepository: vi.fn().mockRejectedValue(new Error("load failed")),
    });
    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state).toEqual({ status: "error", message: "load failed" });
  });

  it("retry returns to loading and re-runs create and load", async () => {
    const layout = layoutOf("r2");
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce(layout);
    mocks.createNecroAdapter.mockReturnValue({ loadSampleRepository: load });

    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    act(() => result.current.retry());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    expect(mocks.createNecroAdapter).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({ status: "ready", layout });
  });

  it("retry after an import failure attempts the import again", async () => {
    mockFailingImport("import failed");
    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    const layout = layoutOf("r3");
    vi.resetModules();
    mockWorkingImport();
    mocks.createNecroAdapter.mockReturnValue({ loadSampleRepository: vi.fn().mockResolvedValue(layout) });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state).toMatchObject({ layout });
  });

  it("a stale attempt does not overwrite a newer one", async () => {
    const stale = deferred<DungeonLayout>();
    const fresh = layoutOf("fresh");
    mocks.createNecroAdapter
      .mockReturnValueOnce({ loadSampleRepository: () => stale.promise })
      .mockReturnValueOnce({ loadSampleRepository: () => Promise.resolve(fresh) });

    const { result } = renderHook(() => useAdapterLoader());
    await waitFor(() => expect(mocks.createNecroAdapter).toHaveBeenCalledTimes(1));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    await act(async () => {
      stale.resolve(layoutOf("stale"));
      await stale.promise;
    });
    expect(result.current.state).toMatchObject({ status: "ready", layout: fresh });
  });
});
