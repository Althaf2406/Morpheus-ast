/**
 * Property-based test for Code_Loader permutation invariance.
 *
 * Feature: bring-your-own-code, Property 5: Load_Result is invariant under input permutation
 * **Validates: Requirements 1.9, 9.2**
 *
 * Candidates are generated with distinct normalised paths: the one permutation-sensitive case
 * (which of two same-path candidates is kept) is covered by the duplicate-path property.
 */

import * as fc from "fast-check";
import { createEngine } from "../../src/index.js";
import { loadCode, normalizePath } from "../../src/loader/index.js";
import type { CandidateFile } from "../../src/contracts.js";

const engine = createEngine();

const segment = fc.stringOf(fc.constantFrom("a", "b", "c", "Z", "0", "_", "é", "😀"), {
  minLength: 1,
  maxLength: 3,
});
const folder = fc.constantFrom("", "", "src/", "./lib/", "node_modules/", "dist/", "__tests__/", "a\\b/");
const extension = fc.constantFrom(".ts", ".tsx", ".js", ".mjs", ".md", ".d.ts", ".test.ts", ".json");
const path = fc.tuple(folder, segment, extension).map(([dir, name, ext]) => `${dir}${name}${ext}`);
const content = fc.oneof(
  { weight: 4, arbitrary: fc.string({ maxLength: 40 }) },
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 1, arbitrary: fc.integer({ min: 90_000, max: 110_000 }).map((n) => "x".repeat(n)) }
);
const candidate: fc.Arbitrary<CandidateFile> = fc.record({ path, content });

/** A list with pairwise-distinct normalised paths, paired with a shuffled copy of itself. */
function listWithShuffle(
  list: fc.Arbitrary<CandidateFile[]>
): fc.Arbitrary<[CandidateFile[], CandidateFile[]]> {
  return list.chain((items) =>
    fc
      .shuffledSubarray(items, { minLength: items.length, maxLength: items.length })
      .map((shuffled): [CandidateFile[], CandidateFile[]] => [items, shuffled])
  );
}

const distinct = (arb: fc.Arbitrary<CandidateFile>, min: number, max: number) =>
  fc.uniqueArray(arb, { minLength: min, maxLength: max, selector: (c) => normalizePath(c.path) });

describe("Feature: bring-your-own-code, Property 5: Load_Result is invariant under input permutation", () => {
  it("files, skipped and summary are identical for any ordering of the same candidates", () => {
    fc.assert(
      fc.property(listWithShuffle(distinct(candidate, 0, 25)), ([original, shuffled]) => {
        expect(loadCode(shuffled)).toEqual(loadCode(original));
      }),
      { numRuns: 200 }
    );
  });

  it("also holds when the 60-file limit is exceeded", () => {
    const many = fc
      .integer({ min: 61, max: 80 })
      .map((n) => Array.from({ length: n }, (_, i): CandidateFile => ({ path: `d${i}/f.ts`, content: "x" })));
    fc.assert(
      fc.property(listWithShuffle(many), ([original, shuffled]) => {
        const result = loadCode(original);
        expect(result.skipped.some((s) => s.reason === "limit exceeded")).toBe(true);
        expect(loadCode(shuffled)).toEqual(result);
      }),
      { numRuns: 100 }
    );
  });

  it("produces identical findings, finding IDs and topology when the loaded files are analysed", async () => {
    const sample: CandidateFile[] = engine
      .getSampleRepository()
      .files.map((f) => ({ path: f.filePath, content: f.sourceText }));
    const noise = distinct(candidate, 0, 6).map((items) =>
      items.filter((c) => !sample.some((s) => normalizePath(s.path) === normalizePath(c.path)))
    );
    const pool = fc.tuple(fc.shuffledSubarray(sample, { minLength: 1 }), noise).map(([s, n]) => [...s, ...n]);

    const analyse = async (candidates: readonly CandidateFile[]): Promise<string> => {
      const loaded = loadCode(candidates);
      const parsed = await engine.parseSourceFiles({
        filePaths: [],
        virtualFiles: loaded.files,
        includeSourceText: true,
      });
      const graph = await engine.buildTopologyGraph(parsed.files);
      const findings = await engine.runSecurityScan(parsed.files);
      const { durationMs: _timing, ...topology } = graph; // wall-clock, not analysis output
      return JSON.stringify({ loaded, topology, findings });
    };

    await fc.assert(
      fc.asyncProperty(listWithShuffle(pool), async ([original, shuffled]) => {
        expect(await analyse(shuffled)).toBe(await analyse(original));
      }),
      { numRuns: 25 }
    );
  });
});
