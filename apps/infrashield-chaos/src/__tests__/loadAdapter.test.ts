/**
 * Adapter example tests for loading user code: replace/restore, failures, clean code,
 * apply/rollback, fault injection and GitHub loading. Uses the real engine.
 * Validates: Requirements 5.1, 5.3, 5.7, 6.3, 7.1, 7.2, 9.7, 9.9
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CandidateFile } from "../../../../packages/morpheus-ast-core/src/contracts.js";
import { createInfraShieldAdapter, type InfraShieldAdapter, type LoadOutcome } from "../adapter";

// --- Fixtures ---

const CLEAN = "export function add(a: number, b: number): number {\n  return a + b;\n}\n";
const TWO_FUNCTIONS =
  "export function inner(x: number): number {\n  return x * 2;\n}\nexport function outer(x: number): number {\n  return inner(x) + 1;\n}\n";

function candidate(path: string, content: string): CandidateFile {
  return { path, content };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Loads candidates and fails the test unless the load succeeded. */
async function loadOk(adapter: InfraShieldAdapter, files: readonly CandidateFile[]): Promise<void> {
  const outcome = await adapter.loadFromCandidates(files);
  if (!outcome.ok) throw new Error(outcome.message);
}

function messageOf(outcome: LoadOutcome): string {
  if (outcome.ok) throw new Error("expected a failed load");
  return outcome.message;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loaded repository", () => {
  it("replaces the sample, and backToSample restores it", async () => {
    const adapter = createInfraShieldAdapter();
    const sample = await adapter.loadSampleRepository();

    await loadOk(adapter, [candidate("src/two.ts", TWO_FUNCTIONS)]);
    expect(adapter.isLoadedRepositoryActive()).toBe(true);
    expect(adapter.getLayout().nodes.map((n) => n.name).sort()).toEqual(["inner", "outer"]);

    const restored = await adapter.backToSample();
    expect(adapter.isLoadedRepositoryActive()).toBe(false);
    expect(restored.nodes.map((n) => n.id)).toEqual(sample.nodes.map((n) => n.id));
  });

  it("returns the no-supported-files message listing extensions, without changing state", async () => {
    const adapter = createInfraShieldAdapter();
    await adapter.loadSampleRepository();

    const message = messageOf(await adapter.loadFromCandidates([candidate("notes.txt", "hello")]));

    expect(message).toMatch(/no supported source files/i);
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) expect(message).toContain(ext);
    expect(adapter.isLoadedRepositoryActive()).toBe(false);
  });

  it("reports no functions and keeps the previous repository", async () => {
    const adapter = createInfraShieldAdapter();
    await loadOk(adapter, [candidate("src/two.ts", TWO_FUNCTIONS)]);

    const message = messageOf(await adapter.loadFromCandidates([candidate("src/data.ts", "export const x = 1;\n")]));

    expect(message).toMatch(/no functions were found/i);
    expect(adapter.isLoadedRepositoryActive()).toBe(true);
    expect(adapter.getLayout().nodes.map((n) => n.name).sort()).toEqual(["inner", "outer"]);
    expect(adapter.getSourceText("src/two.ts")).toBe(TWO_FUNCTIONS);
  });

  it("loads clean code with zero findings", async () => {
    const adapter = createInfraShieldAdapter();
    const outcome = await adapter.loadFromCandidates([candidate("src/add.ts", CLEAN)]);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.findingsCount).toBe(0);
      expect(outcome.filesAnalyzed).toBe(1);
    }
  });
});

describe("operations on loaded code", () => {
  it("rolls an applied patch back to byte-identical source", async () => {
    const adapter = createInfraShieldAdapter();
    await loadOk(adapter, [candidate("src/two.ts", TWO_FUNCTIONS)]);

    const splice = { filePath: "src/two.ts", startIndex: 0, endIndex: 0, replacement: "// patched\n", description: "edit" };
    await adapter.applyMutation({ splices: [splice] });
    expect(adapter.getSourceText("src/two.ts")).toBe(`// patched\n${TWO_FUNCTIONS}`);

    await adapter.rollbackLastMutation();
    expect(adapter.getSourceText("src/two.ts")).toBe(TWO_FUNCTIONS);
    expect(adapter.getInspectorTelemetry().rollbackVerified).toBe(true);
  });

  it("injects a fault on a loaded function", async () => {
    const adapter = createInfraShieldAdapter();
    vi.spyOn(adapter["engine"], "generateBedrockPatch").mockRejectedValue(new Error("no credentials"));
    await loadOk(adapter, [candidate("src/two.ts", TWO_FUNCTIONS)]);
    const inner = adapter.getLayout().nodes.find((n) => n.name === "inner");
    if (inner === undefined) throw new Error("inner not found");

    const layout = await adapter.injectFault({ targetFunctionId: inner.id, faultType: "UNCAUGHT_EXCEPTION" });

    expect(layout.activeFault?.targetFunctionId).toBe(inner.id);
    expect(layout.nodes.find((n) => n.id === inner.id)?.isFaulted).toBe(true);
    expect(adapter.getInspectorTelemetry().lastFault?.targetFunctionId).toBe(inner.id);
  });
});

describe("loadFromGitHub", () => {
  it("loads a repository from mocked responses", async () => {
    const adapter = createInfraShieldAdapter();
    const fetchFn = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("https://raw.githubusercontent.com/")) return new Response(TWO_FUNCTIONS);
      if (url.includes("/git/trees/")) return jsonResponse({ tree: [{ type: "blob", path: "src/two.ts", size: 100 }] });
      return jsonResponse({ default_branch: "main" });
    });

    const outcome = await adapter.loadFromGitHub("octo/demo", fetchFn);

    expect(outcome.ok).toBe(true);
    expect(adapter.isLoadedRepositoryActive()).toBe(true);
    expect(adapter.getSourceText("src/two.ts")).toBe(TWO_FUNCTIONS);
  });

  it("returns the rate-limit message and keeps the current repository", async () => {
    const adapter = createInfraShieldAdapter();
    await adapter.loadSampleRepository();
    const fetchFn = vi.fn(async (): Promise<Response> => new Response("", { status: 403 }));

    const message = messageOf(await adapter.loadFromGitHub("octo/demo", fetchFn));

    expect(message).toMatch(/limiting anonymous requests/i);
    expect(adapter.isLoadedRepositoryActive()).toBe(false);
  });
});
