// @vitest-environment jsdom
/**
 * Repo_Param behaviour through App with a mocked adapter and a stubbed scene.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.8**
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DungeonLayout, LoadOutcome } from "../adapter.ts";

// --- Scene stub (WebGL is not available in jsdom) ---
vi.mock("../components/dungeon/DungeonScene.tsx", () => ({
  DungeonScene: ({ layout }: { readonly layout: DungeonLayout }) => (
    <div data-testid="scene" data-total={layout.totalEntities} />
  ),
}));

// --- Mocked adapter module ---
const mocks = vi.hoisted(() => ({ createNecroAdapter: vi.fn() }));

// --- Fixtures ---
const layoutOf = (totalEntities: number): DungeonLayout => ({ rooms: [], corridors: [], totalEntities, bossRoomIds: [] });
const SAMPLE = layoutOf(0);
const LOADED = layoutOf(7);
const REF = /^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+)$/;
const success = (): LoadOutcome =>
  ({ ok: true, layout: LOADED, summary: {}, filesAnalyzed: 1, findingsCount: 0, skipped: [] }) as unknown as LoadOutcome;
const failure = (): LoadOutcome => ({ ok: false, message: "GitHub said no" }) as unknown as LoadOutcome;

function createFake(outcome: () => LoadOutcome) {
  let loaded = false;
  return {
    loadSampleRepository: vi.fn(async () => SAMPLE),
    parseRepositoryRef: vi.fn((value: string) => {
      const m = REF.exec(value);
      return m === null ? null : { owner: m[1], name: m[2] };
    }),
    loadFromGitHub: vi.fn(async () => {
      const result = outcome();
      loaded = result.ok;
      return result;
    }),
    backToSample: vi.fn(async () => {
      loaded = false;
      return SAMPLE;
    }),
    isLoadedRepositoryActive: vi.fn(() => loaded),
    loadFromCandidates: vi.fn(),
    getTelemetry: vi.fn(),
    buildDungeonLayout: vi.fn(() => SAMPLE),
  };
}

// --- Harness ---
async function mountApp(fake: ReturnType<typeof createFake>, search: string): Promise<void> {
  window.history.replaceState(null, "", `/${search}`);
  mocks.createNecroAdapter.mockReturnValue(fake);
  const { default: App } = await import("../App.tsx");
  render(<App />);
  await screen.findByTestId("scene");
}
const total = (): string | undefined => screen.getByTestId("scene").dataset.total;

beforeEach(() => {
  vi.resetModules();
  mocks.createNecroAdapter.mockReset();
  vi.doMock("../adapter.ts", () => ({ createNecroAdapter: mocks.createNecroAdapter }));
  window.matchMedia = ((query: string) => ({ matches: false, media: query })) as typeof window.matchMedia;
  // The first-visit tour is also a dialog; mark it seen so these tests only see the load dialog.
  const seen = new Map([["morpheus-tour-seen-necro", "1"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => seen.get(key) ?? null,
    setItem: (key: string, value: string) => void seen.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Repo_Param", () => {
  it("a valid ?repo opens the GitHub tab pre-filled, loads it and writes the address bar", async () => {
    const fake = createFake(success);
    await mountApp(fake, "?repo=https://github.com/octocat/hello-world");

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "GitHub repo" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText(/GitHub repository/) as HTMLInputElement).value).toBe("octocat/hello-world");
    await waitFor(() => expect(total()).toBe("7"));
    expect(fake.loadFromGitHub).toHaveBeenCalledTimes(1);
    expect(fake.loadFromGitHub).toHaveBeenCalledWith("octocat/hello-world");
    expect(window.location.search).toBe("?repo=octocat/hello-world");
  });

  it("an invalid ?repo keeps the sample, shows the format error and does not load", async () => {
    const fake = createFake(success);
    await mountApp(fake, "?repo=not%20a%20repo");

    expect(screen.getByRole("alert").textContent).toContain("owner/name");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(total()).toBe("0");
    expect(fake.loadFromGitHub).not.toHaveBeenCalled();
  });

  it("Back to sample repository restores the sample and removes the param", async () => {
    const fake = createFake(success);
    await mountApp(fake, "?repo=octocat/hello-world&x=1");
    await waitFor(() => expect(total()).toBe("7"));
    expect(window.location.search).toBe("?x=1&repo=octocat/hello-world");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(await screen.findByRole("button", { name: "Back to sample repository" }));

    await waitFor(() => expect(total()).toBe("0"));
    expect(window.location.search).toBe("?x=1");
  });

  it("a failed load keeps the sample and leaves the address bar unchanged", async () => {
    const fake = createFake(failure);
    await mountApp(fake, "?repo=octocat/hello-world");

    await waitFor(() => expect(fake.loadFromGitHub).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/GitHub said no/)).toBeTruthy();
    expect(total()).toBe("0");
    expect(window.location.search).toBe("?repo=octocat/hello-world");
  });
});
