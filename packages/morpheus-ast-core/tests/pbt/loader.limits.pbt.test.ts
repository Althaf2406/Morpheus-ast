/**
 * tests/pbt/loader.limits.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 3: Load_Limits are never exceeded,
 * and overflow is a success, not a failure.
 *
 * **Validates: Requirements 1.6, 1.8, 9.1**
 */
import * as fc from "fast-check";
import { loadCode } from "../../src/loader/index.js";
import type { CandidateFile, LoadResult } from "../../src/contracts.js";

const MAX_FILES = 60;
const MAX_TOTAL_BYTES = 409_600;
const MAX_FILE_BYTES = 102_400;
const RUNS = 100;

const encoder = new TextEncoder();

/** A character and its UTF-8 width, so content size is exact by construction. */
const unit = fc.constantFrom(
  { ch: "a", width: 1 },
  { ch: "\u00e9", width: 2 },
  { ch: "\u20ac", width: 3 },
  { ch: "\u{1F600}", width: 4 }
);

/** Target byte size: biased so both the count limit and the byte limit get hit. */
const targetBytes = fc.oneof(
  { arbitrary: fc.integer({ min: 1, max: 3_000 }), weight: 3 },
  { arbitrary: fc.integer({ min: 20_000, max: MAX_FILE_BYTES - 1 }), weight: 2 }
);

const sizedContent = fc
  .tuple(unit, targetBytes)
  .map(([u, bytes]) => `x${u.ch.repeat(Math.floor(bytes / u.width))}`);

/** Eligible candidates: unique, supported-extension paths outside ignored folders. */
const eligibleFiles = (maxFiles: number): fc.Arbitrary<CandidateFile[]> =>
  fc
    .array(sizedContent, { minLength: 0, maxLength: maxFiles })
    .map((contents) =>
      contents.map((content, i) => ({ path: `src/m${String(i).padStart(3, "0")}.ts`, content }))
    );

function assertBounded(result: LoadResult): void {
  const total = result.files.reduce((sum, f) => sum + encoder.encode(f.sourceText).length, 0);
  expect(result.files.length).toBeLessThanOrEqual(MAX_FILES);
  expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  expect(result.summary.totalBytes).toBe(total);
  expect(result.summary.loadedCount).toBe(result.files.length);
  expect(result.summary.skippedCount).toBe(result.skipped.length);
}

describe("Feature: bring-your-own-code, Property 3: Load_Limits are never exceeded, and overflow is a success, not a failure", () => {
  it("never exceeds 60 files or 409,600 bytes, and never throws", () => {
    fc.assert(
      fc.property(eligibleFiles(90), (candidates) => {
        const result = loadCode(candidates);
        assertBounded(result);
        expect(result.files.length + result.skipped.length).toBe(candidates.length);
      }),
      { numRuns: RUNS }
    );
  });

  it("reports overflow only as 'limit exceeded' skips, with no other failure shape", () => {
    fc.assert(
      fc.property(eligibleFiles(90), (candidates) => {
        const result = loadCode(candidates);
        // Every candidate is eligible, so the only possible skip reason is overflow.
        for (const s of result.skipped) expect(s.reason).toBe("limit exceeded");
        expect(Object.keys(result).sort()).toEqual(["files", "skipped", "summary"]);
      }),
      { numRuns: RUNS }
    );
  });

  it("still loads files up to the limit when input far exceeds it", () => {
    fc.assert(
      fc.property(fc.integer({ min: MAX_FILES + 1, max: 200 }), (count) => {
        const candidates: CandidateFile[] = Array.from({ length: count }, (_, i) => ({
          path: `src/f${String(i).padStart(3, "0")}.ts`,
          content: "const a = 1;",
        }));
        const result = loadCode(candidates);
        assertBounded(result);
        expect(result.files).toHaveLength(MAX_FILES);
        expect(result.skipped).toHaveLength(count - MAX_FILES);
      }),
      { numRuns: RUNS }
    );
  });
});
