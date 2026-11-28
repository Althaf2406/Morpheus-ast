/**
 * Property-based test for the Code_Loader's duplicate path handling.
 *
 * Feature: bring-your-own-code, Property 7: Duplicate normalised paths keep the first, skip the rest
 * **Validates: Requirements 1.11**
 */

import * as fc from "fast-check";
import { loadCode, normalizePath } from "../../src/loader/index.js";
import type { CandidateFile } from "../../src/contracts.js";

const segment = fc.stringOf(fc.constantFrom("a", "b", "c", "Z", "0", "9", "_", "-"), {
  minLength: 1,
  maxLength: 4,
});

/** An eligible, already-normalised path: plain folders and a supported extension. */
const eligiblePath = fc
  .tuple(
    fc.array(segment, { maxLength: 2 }),
    segment,
    fc.constantFrom(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
  )
  .map(([dirs, name, ext]) => [...dirs, `${name}${ext}`].join("/"));

/** Ways of writing the same path that normalise identically. */
const spellings: ReadonlyArray<(path: string) => string> = [
  (path) => path,
  (path) => `./${path}`,
  (path) => `././${path}`,
  (path) => path.replace(/\//g, "\\"),
  (path) => `.\\${path.replace(/\//g, "\\")}`,
];

interface Scenario {
  readonly input: readonly CandidateFile[];
  readonly normalised: readonly string[];
}

/** Candidates drawn from a small path pool so repeats are common; contents are all distinct. */
const scenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    fc.uniqueArray(eligiblePath, { minLength: 1, maxLength: 5 }),
    fc.array(fc.tuple(fc.nat(), fc.nat(spellings.length - 1)), { minLength: 1, maxLength: 30 })
  )
  .map(([pool, picks]) => {
    const normalised = picks.map(([index]) => pool[index % pool.length] ?? "");
    const input = picks.map(([, spelling], position) => ({
      path: (spellings[spelling] ?? spellings[0] ?? ((p: string) => p))(normalised[position] ?? ""),
      content: `export const v${position} = ${position};`,
    }));
    return { input, normalised };
  });

describe("Feature: bring-your-own-code, Property 7: duplicate normalised paths keep the first, skip the rest", () => {
  it("loads the first entry per normalised path and skips every later one as 'duplicate path'", () => {
    fc.assert(
      fc.property(scenario, ({ input, normalised }) => {
        // Every entry is eligible and small, so only the duplicate rule can exclude one.
        const firstIndex = new Map<string, number>();
        const duplicatesPerPath = new Map<string, number>();
        normalised.forEach((path, position) => {
          if (firstIndex.has(path)) {
            duplicatesPerPath.set(path, (duplicatesPerPath.get(path) ?? 0) + 1);
          } else {
            firstIndex.set(path, position);
          }
        });

        const result = loadCode(input);

        // Each normalised path is loaded at most once, with the first entry's content.
        const loadedPaths = result.files.map((file) => file.filePath);
        expect(new Set(loadedPaths).size).toBe(loadedPaths.length);
        expect(loadedPaths).toHaveLength(firstIndex.size);
        for (const file of result.files) {
          const position = firstIndex.get(file.filePath);
          expect(position).toBeDefined();
          expect(file.sourceText).toBe(input[position ?? 0]?.content);
        }

        // Later entries are skipped as duplicates, reported under the normalised path.
        const skippedDuplicates = new Map<string, number>();
        for (const entry of result.skipped) {
          expect(entry.reason).toBe("duplicate path");
          expect(entry.path).toBe(normalizePath(entry.path));
          skippedDuplicates.set(entry.path, (skippedDuplicates.get(entry.path) ?? 0) + 1);
        }
        expect(skippedDuplicates).toEqual(duplicatesPerPath);
        expect(result.summary.skippedCount).toBe(input.length - firstIndex.size);
      }),
      { numRuns: 200 }
    );
  });

  it("keeps the first entry when two spellings of one path differ in content", () => {
    const result = loadCode([
      { path: "./src/a.ts", content: "first" },
      { path: "src\\a.ts", content: "second" },
    ]);
    expect(result.files).toEqual([{ filePath: "src/a.ts", sourceText: "first" }]);
    expect(result.skipped).toEqual([{ path: "src/a.ts", reason: "duplicate path" }]);
  });
});
