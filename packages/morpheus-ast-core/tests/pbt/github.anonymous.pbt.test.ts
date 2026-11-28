/**
 * tests/pbt/github.anonymous.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 10: GitHub requests never carry an Authorization header or token
 *
 * **Validates: Requirements 2.3, 9.6**
 */
import * as fc from "fast-check";
import { fetchGitHubRepository } from "../../src/loader/github.js";

const RUNS = 100;
const ALLOWED_HOSTS: readonly string[] = ["api.github.com", "raw.githubusercontent.com"];

const segment = fc.stringMatching(/^[A-Za-z0-9_.-]{1,12}$/);
const branchName = fc.stringMatching(/^[A-Za-z0-9_-]{1,10}$/);

/** A parseable reference: owner/name, or a github.com URL with an optional branch. */
const reference: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(segment, segment).map(([o, n]) => `${o}/${n}`),
  fc.tuple(segment, segment).map(([o, n]) => `https://github.com/${o}/${n}`),
  fc.tuple(segment, segment, branchName).map(([o, n, b]) => `https://github.com/${o}/${n}/tree/${b}`)
);

const filePath = fc
  .tuple(fc.array(segment, { maxLength: 2 }), fc.stringMatching(/^[a-z]{1,6}$/), fc.constantFrom(".ts", ".js", ".md", ".png"))
  .map(([dirs, base, ext]) => [...dirs, `${base}${ext}`].join("/"));

type Scenario =
  | { readonly kind: "ok"; readonly paths: readonly string[]; readonly branch: string }
  | { readonly kind: "status"; readonly status: number }
  | { readonly kind: "throw" };

const scenario: fc.Arbitrary<Scenario> = fc.oneof(
  fc.record({
    kind: fc.constant("ok" as const),
    paths: fc.uniqueArray(filePath, { maxLength: 12 }),
    branch: branchName,
  }),
  fc.record({ kind: fc.constant("status" as const), status: fc.constantFrom(403, 404, 429, 500) }),
  fc.constant({ kind: "throw" as const })
);

interface Recorded {
  readonly input: string;
  readonly init: RequestInit | undefined;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function makeFetch(sc: Scenario, log: Recorded[]): typeof fetch {
  return (input, init) => {
    log.push({ input: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init });
    if (sc.kind === "throw") return Promise.reject(new Error("offline"));
    if (sc.kind === "status") return Promise.resolve(new Response("", { status: sc.status }));
    const url = log[log.length - 1]?.input ?? "";
    if (url.includes("/git/trees/")) {
      return Promise.resolve(json({ tree: sc.paths.map((path) => ({ type: "blob", path, size: 10 })) }));
    }
    if (url.startsWith("https://api.github.com/")) return Promise.resolve(json({ default_branch: sc.branch }));
    return Promise.resolve(new Response("export const x = 1;\n", { status: 200 }));
  };
}

function headerNames(init: RequestInit | undefined): string[] {
  if (init?.headers === undefined) return [];
  return [...new Headers(init.headers).keys()].map((k) => k.toLowerCase());
}

describe("Feature: bring-your-own-code, Property 10: GitHub requests never carry an Authorization header or token", () => {
  it("every request is anonymous and targets only the two GitHub hosts", async () => {
    await fc.assert(
      fc.asyncProperty(reference, scenario, async (ref, sc) => {
        const log: Recorded[] = [];
        await fetchGitHubRepository(ref, makeFetch(sc, log));

        expect(log.length).toBeGreaterThan(0);
        for (const { input, init } of log) {
          const url = new URL(input);
          expect(url.protocol).toBe("https:");
          expect(ALLOWED_HOSTS).toContain(url.hostname);
          expect(url.username).toBe("");
          expect(url.password).toBe("");
          expect(headerNames(init)).not.toContain("authorization");
          expect(headerNames(init)).not.toContain("cookie");
          expect(init?.body ?? null).toBeNull();
          expect(init?.credentials === undefined || init.credentials === "omit").toBe(true);
          expect(/token|access_token|authorization/i.test(url.search)).toBe(false);
        }
      }),
      { numRuns: RUNS }
    );
  });
});
