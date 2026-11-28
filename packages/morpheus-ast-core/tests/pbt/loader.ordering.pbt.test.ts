/**
 * Property-based test for the Code_Loader's limit ordering.
 *
 * Feature: bring-your-own-code, Property 4: Files skipped for "limit exceeded" sort after every loaded file
 * **Validates: Requirements 1.5, 1.7, 9.4**
 */

import * as fc from "fast-check";
import { loadCode, normalizePath } from "../../src/loader/index.js";
import type { CandidateFile } from "../../src/contracts.js";

/** Ascending code-point order, independent of the implementation under test. */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a, (ch) => ch.codePointAt(0) ?? 0);
  const right = Array.from(b, (ch) => ch.codePointAt(0) ?? 0);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

const segment = fc.stringOf(
  fc.constantFrom("a", "b", "c", "Z", "0", "9", "_", "-", "é", "世", "😀"),
  { minLength: 1, maxLength: 4 }
);

/** An eligible path: plain folders (no ignored or test names) and a supported extension. */
const eligiblePath = fc
  .tuple(
    fc.array(segment, { maxLength: 2 }),
    segment,
    fc.constantFrom(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
  )
  .map(([dirs, name, ext]) => [...dirs, `${name}${ext}`].join("/"));

/** Non-empty content, mostly small with some large files so the byte limit can trigger. */
const content = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 200 }) },
  { weight: 1, arbitrary: fc.integer({ min: 20_000, max: 102_400 }) }
).map((length) => "x".repeat(length));

const candidate: fc.Arbitrary<CandidateFile> = fc.record({ path: eligiblePath, content });

/** Mixes small lists with lists large enough to exceed the 60-file limit. */
const candidates = fc.oneof(
  fc.array(candidate, { maxLength: 20 }),
  fc.array(candidate, { minLength: 61, maxLength: 90 })
);

describe("Feature: bring-your-own-code, Property 4: limit-exceeded files sort after loaded files", () => {
  it("every 'limit exceeded' path is >= every loaded path, and loaded files are ascending", () => {
    fc.assert(
      fc.property(candidates, (input) => {
        const result = loadCode(input);
        const loaded = result.files.map((file) => file.filePath);
        const cut = result.skipped
          .filter((entry) => entry.reason === "limit exceeded")
          .map((entry) => entry.path);

        for (let i = 1; i < loaded.length; i++) {
          expect(compareCodePoints(loaded[i - 1] ?? "", loaded[i] ?? "")).toBeLessThan(0);
        }
        for (const cutPath of cut) {
          for (const loadedPath of loaded) {
            expect(compareCodePoints(cutPath, loadedPath)).toBeGreaterThanOrEqual(0);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it("cuts files once the limits are hit, so the property is exercised", () => {
    const many: CandidateFile[] = Array.from({ length: 70 }, (_, i) => ({
      path: normalizePath(`./src/f${String(i).padStart(2, "0")}.ts`),
      content: "x",
    }));
    const result = loadCode(many);
    expect(result.files).toHaveLength(60);
    expect(result.skipped.filter((s) => s.reason === "limit exceeded")).toHaveLength(10);
  });
});
