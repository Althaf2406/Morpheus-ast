/**
 * tests/pbt/github.eligible.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 11: Only eligible paths have their content fetched
 *
 * **Validates: Requirements 2.4**
 */
import * as fc from "fast-check";
import { fetchGitHubRepository } from "../../src/loader/github.js";
import { isEligiblePath } from "../../src/loader/index.js";

const RUNS = 100;
const RAW_PREFIX = "https://raw.githubusercontent.com/octo/repo/main/";

const word = fc.stringMatching(/^[a-z0-9_-]{1,6}$/);
const dirName = fc.oneof(
  word,
  fc.constantFrom("node_modules", "dist", "build", ".git", "__tests__", "src", "lib")
);
const fileName = fc
  .tuple(
    word,
    fc.constantFrom(
      ".ts", ".tsx", ".js", ".jsx", ".py", ".d.ts", ".test.ts", ".spec.js",
      ".md", ".png", ".json", ".lock", ""
    )
  )
  .map(([base, ext]) => `${base}${ext}`);

/** A repository file listing: a mix of eligible and ineligible, unique paths. */
const listing = fc.uniqueArray(
  fc.tuple(fc.array(dirName, { maxLength: 3 }), fileName).map(([dirs, f]) => [...dirs, f].join("/")),
  { maxLength: 25 }
);

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("Feature: bring-your-own-code, Property 11: Only eligible paths have their content fetched", () => {
  it("requests raw content exactly for the paths accepted by isEligiblePath", async () => {
    await fc.assert(
      fc.asyncProperty(listing, async (paths) => {
        const requested: string[] = [];
        const fetchFn: typeof fetch = (input) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (url.startsWith(RAW_PREFIX)) {
            requested.push(url.slice(RAW_PREFIX.length));
            return Promise.resolve(new Response("export const a = 1;\n", { status: 200 }));
          }
          if (url === "https://api.github.com/repos/octo/repo") {
            return Promise.resolve(json({ default_branch: "main" }));
          }
          if (url.startsWith("https://api.github.com/repos/octo/repo/git/trees/")) {
            return Promise.resolve(
              json({ tree: paths.map((path) => ({ path, type: "blob", size: 20 })) })
            );
          }
          return Promise.reject(new Error(`unexpected request: ${url}`));
        };

        const result = await fetchGitHubRepository("octo/repo", fetchFn);

        expect(result.ok).toBe(true);
        const expected = paths.filter((p) => isEligiblePath(p));
        expect([...requested].sort()).toEqual([...expected].sort());
        for (const path of requested) expect(isEligiblePath(path)).toBe(true);
      }),
      { numRuns: RUNS }
    );
  });
});
