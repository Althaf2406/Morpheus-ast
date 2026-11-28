/**
 * tests/pbt/loader.partition.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 1: Every candidate is loaded or skipped exactly once
 *
 * **Validates: Requirements 1.1, 9.3**
 */

import * as fc from "fast-check";
import { createEngine } from "../../src/index.js";
import type { CandidateFile } from "../../src/contracts.js";

const engine = createEngine();

const NUM_RUNS = 100;
const OVERSIZED = "a".repeat(102_401);

const segmentArb = fc.constantFrom(
  "src",
  "lib",
  "node_modules",
  "dist",
  "build",
  ".git",
  "__tests__",
  "util",
  "a",
  "b"
);
const nameArb = fc.constantFrom(
  "index",
  "main",
  "app",
  "util",
  "x.test",
  "y.spec",
  "types.d",
  "readme",
  "data"
);
const extArb = fc.constantFrom(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".json", ".py", "");
const prefixArb = fc.constantFrom("", "", "", "./", "././");
const separatorArb = fc.constantFrom("/", "/", "\\");

const pathArb = fc
  .tuple(prefixArb, fc.array(segmentArb, { maxLength: 3 }), nameArb, extArb, separatorArb)
  .map(([prefix, dirs, name, ext, sep]) => prefix + [...dirs, name + ext].join(sep));

const contentArb = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 1, maxLength: 40 }) },
  { weight: 2, arbitrary: fc.constantFrom("", "   ", "\n\t") },
  { weight: 1, arbitrary: fc.constant(OVERSIZED) }
);

const candidateArb: fc.Arbitrary<CandidateFile> = fc.record({
  path: pathArb,
  content: contentArb,
});

/** Mostly small mixed lists; sometimes many distinct eligible files to trigger limits. */
const manyEligibleArb: fc.Arbitrary<CandidateFile[]> = fc
  .array(fc.string({ minLength: 1, maxLength: 3000 }), { minLength: 55, maxLength: 80 })
  .map((contents) =>
    contents.map((content, i) => ({ path: `src/file${String(i).padStart(3, "0")}.ts`, content }))
  );

const candidatesArb = fc.oneof(
  { weight: 5, arbitrary: fc.array(candidateArb, { maxLength: 30 }) },
  { weight: 1, arbitrary: manyEligibleArb }
);

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

function countBy(paths: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
  return counts;
}

describe("Feature: bring-your-own-code, Property 1: Every candidate is loaded or skipped exactly once", () => {
  it("partitions every input into exactly one of files or skipped", () => {
    fc.assert(
      fc.property(candidatesArb, (candidates) => {
        const result = engine.loadCode(candidates);

        // Counts add up, and the summary agrees with the arrays.
        expect(result.files.length + result.skipped.length).toBe(candidates.length);
        expect(result.summary.loadedCount).toBe(result.files.length);
        expect(result.summary.skippedCount).toBe(result.skipped.length);
        expect(result.summary.loadedCount + result.summary.skippedCount).toBe(candidates.length);

        // Each input (by normalized path, with multiplicity) appears exactly once overall.
        const expected = countBy(candidates.map((c) => normalize(c.path)));
        const actual = countBy([
          ...result.files.map((f) => f.filePath),
          ...result.skipped.map((s) => s.path),
        ]);
        expect(actual).toEqual(expected);

        // A path is never loaded twice.
        const loadedPaths = result.files.map((f) => f.filePath);
        expect(new Set(loadedPaths).size).toBe(loadedPaths.length);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("covers the empty input", () => {
    const result = engine.loadCode([]);
    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.summary).toEqual({ loadedCount: 0, totalBytes: 0, skippedCount: 0 });
  });
});
