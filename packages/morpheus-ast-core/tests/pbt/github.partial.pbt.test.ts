/**
 * tests/pbt/github.partial.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 12: A partial download failure skips only the failed files
 *
 * **Validates: Requirements 2.9, 2.10, 9.6**
 */
import * as fc from "fast-check";
import { fetchGitHubRepository } from "../../src/loader/github.js";

const RUNS = 100;
const RAW_PREFIX = "https://raw.githubusercontent.com/o/r/main/";

type Failure = "status" | "reject";

interface Scenario {
  readonly paths: readonly string[];
  readonly failures: ReadonlyMap<string, Failure>;
}

const names = fc.uniqueArray(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 20 });

const scenario: fc.Arbitrary<Scenario> = names.chain((ids) => {
  const paths = ids.map((n) => `src/f${n}.ts`);
  return fc
    .array(fc.constantFrom<Failure | null>(null, "status", "reject"), {
      minLength: paths.length,
      maxLength: paths.length,
    })
    .filter((modes) => modes.some((m) => m !== null))
    .map((modes) => {
      const failures = new Map<string, Failure>();
      modes.forEach((mode, i) => {
        const path = paths[i];
        if (mode !== null && path !== undefined) failures.set(path, mode);
      });
      return { paths, failures };
    });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function mockFetch(s: Scenario): typeof fetch {
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/repos/o/r/git/trees/")) {
      return jsonResponse({ tree: s.paths.map((path) => ({ type: "blob", path, size: 10 })) });
    }
    if (url.startsWith("https://api.github.com/repos/o/r")) {
      return jsonResponse({ default_branch: "main" });
    }
    const path = decodeURIComponent(url.slice(RAW_PREFIX.length));
    const failure = s.failures.get(path);
    if (failure === "reject") throw new Error("socket closed");
    if (failure === "status") return new Response("nope", { status: 500 });
    return new Response(`export const v = "${path}";\n`, { status: 200 });
  };
  return impl as typeof fetch;
}

describe("Feature: bring-your-own-code, Property 12: A partial download failure skips only the failed files", () => {
  it("lists failed files as 'download failed', loads the rest, and resolves ok", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (s) => {
        const outcome = await fetchGitHubRepository("o/r", mockFetch(s));
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { files, skipped } = outcome.result;

        const failedSkips = skipped.filter((f) => f.reason === "download failed");
        expect(failedSkips.map((f) => f.path).sort()).toEqual([...s.failures.keys()].sort());

        const okPaths = s.paths.filter((p) => !s.failures.has(p));
        expect(files.map((f) => f.filePath).sort()).toEqual([...okPaths].sort());
        for (const file of files) {
          expect(file.sourceText).toBe(`export const v = "${file.filePath}";\n`);
        }
      }),
      { numRuns: RUNS }
    );
  });
});
