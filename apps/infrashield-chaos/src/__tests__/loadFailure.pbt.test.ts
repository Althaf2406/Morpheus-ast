/**
 * Property 14: a failed load leaves the active repository unchanged.
 * Feature: bring-your-own-code, Property 14: A failed load leaves the active repository unchanged
 * **Validates: Requirements 5.7**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createInfraShieldAdapter, type InfraShieldAdapter } from "../adapter";

const GOOD_SOURCE = "export function alpha(): number { return beta(); }\nexport function beta(): number { return 1; }\n";

type Failure =
  | { readonly kind: "no-files"; readonly names: readonly string[] }
  | { readonly kind: "no-functions"; readonly values: readonly number[] }
  | { readonly kind: "github"; readonly status: 403 | 404; readonly repo: string };

const nameArb = fc.stringMatching(/^[a-z]{1,8}$/);
const failureArb: fc.Arbitrary<Failure> = fc.oneof(
  fc.record({
    kind: fc.constant("no-files" as const),
    names: fc.array(nameArb, { maxLength: 4 }),
  }),
  fc.record({
    kind: fc.constant("no-functions" as const),
    values: fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 4 }),
  }),
  fc.record({
    kind: fc.constant("github" as const),
    status: fc.constantFrom(403 as const, 404 as const),
    repo: fc.tuple(nameArb, nameArb).map(([owner, name]) => `${owner}/${name}`),
  })
);

function snapshot(adapter: InfraShieldAdapter) {
  const sources = adapter["virtualSources"];
  return {
    layout: structuredClone(adapter.getLayout()),
    graph: structuredClone(adapter["currentGraph"]),
    findings: structuredClone(adapter["currentFindings"]),
    sources: [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)),
    active: adapter.isLoadedRepositoryActive(),
  };
}

async function attempt(adapter: InfraShieldAdapter, failure: Failure): Promise<{ readonly ok: boolean }> {
  switch (failure.kind) {
    case "no-files":
      return adapter.loadFromCandidates(failure.names.map((n) => ({ path: `${n}.txt`, content: "hello" })));
    case "no-functions":
      return adapter.loadFromCandidates([
        { path: "src/consts.ts", content: failure.values.map((v, i) => `export const c${i} = ${v};`).join("\n") },
      ]);
    case "github": {
      const fetchFn: typeof fetch = async () => new Response("{}", { status: failure.status });
      return adapter.loadFromGitHub(failure.repo, fetchFn);
    }
  }
}

describe("Property 14: a failed load leaves the active repository unchanged", () => {
  it("keeps layout, graph, findings, sources and active flag identical", async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), failureArb, async (preloaded, failure) => {
        const adapter = createInfraShieldAdapter();
        await adapter.loadSampleRepository();
        if (preloaded) {
          const ok = await adapter.loadFromCandidates([{ path: "src/good.ts", content: GOOD_SOURCE }]);
          expect(ok.ok).toBe(true);
        }
        const before = snapshot(adapter);
        const outcome = await attempt(adapter, failure);
        expect(outcome.ok).toBe(false);
        expect(snapshot(adapter)).toEqual(before);
      }),
      { numRuns: 100 }
    );
  }, 120_000);
});
