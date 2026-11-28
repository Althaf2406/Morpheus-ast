/**
 * tests/pbt/loader.eligibility.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 2: Eligibility classification matches the Glossary rule
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.4a, 1.4b, 9.5, 9.5a**
 */

import fc from "fast-check";
import { loadCode, MAX_FILE_BYTES } from "../../src/loader/index.js";
import type { CandidateFile, SkipReason } from "../../src/contracts.js";

type Expected = "loaded" | SkipReason;

interface Case {
  readonly candidate: CandidateFile;
  readonly expected: Expected;
}

const DIRS = ["src", "lib", "app", "utils", "core"] as const;
const OK_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;
const BAD_EXT = [".py", ".json", ".md", ".d.ts", ".css", ".txt", ""] as const;
const IGNORED = ["node_modules", "dist", "build", ".git"] as const;
const TEST_MARKERS = [".test", ".spec", ".test-d", ".e2e", ".bench"] as const;
const TEST_FOLDERS = ["test", "tests", "__tests__", "spec", "specs", "__mocks__", "e2e", "fixtures",
  "__fixtures__", "test-d", "type-tests", "types-test", "benchmark", "benchmarks"] as const;
const TEST_STEMS = ["test", "tests", "spec"] as const;

const smallContent = fc.stringMatching(/^[a-z0-9 ;=]{1,40}$/).filter((s) => s.trim() !== "");
const pick = <T>(values: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...values);

/** Builds one candidate that violates exactly one rule (or none), tagged with the expected outcome. */
function caseFor(kind: number, i: number): fc.Arbitrary<Case> {
  const file = `f${i}`;
  const make = (path: string, content: string, expected: Expected): Case => ({
    candidate: { path, content },
    expected,
  });
  switch (kind) {
    case 0:
      return fc.tuple(pick(DIRS), pick(OK_EXT), smallContent).map(([d, e, c]) =>
        make(`${d}/${file}${e}`, c, "loaded")
      );
    case 1:
      return fc.tuple(pick(DIRS), pick(BAD_EXT), smallContent).map(([d, e, c]) =>
        make(`${d}/${file}${e}`, c, "unsupported type")
      );
    case 2:
      return fc.tuple(pick(IGNORED), pick(DIRS), pick(OK_EXT), smallContent).map(([g, d, e, c]) =>
        make(`${d}/${g}/${file}${e}`, c, "ignored folder")
      );
    case 3:
      return fc.tuple(pick(DIRS), pick(TEST_MARKERS), pick(OK_EXT), smallContent).map(([d, m, e, c]) =>
        make(`${d}/${file}${m}${e}`, c, "test file")
      );
    case 4:
      return fc.tuple(pick(DIRS), pick(OK_EXT), pick(TEST_FOLDERS), smallContent).map(
        ([d, e, t, c]) => make(`${d}/${t}/${file}${e}`, c, "test file")
      );
    case 7:
      return fc.tuple(pick(DIRS), pick(TEST_STEMS), pick(OK_EXT), smallContent).map(([d, t, e, c]) =>
        make(`${d}/${t}${e}`, c, "test file")
      );
    case 8:
      // A test folder nested below another folder.
      return fc.tuple(pick(DIRS), pick(TEST_FOLDERS), pick(DIRS), pick(OK_EXT), smallContent).map(
        ([d, t, d2, e, c]) => make(`${d}/${t}/${d2}/${file}${e}`, c, "test file")
      );
    case 5:
      return fc.tuple(pick(DIRS), pick(OK_EXT), fc.stringMatching(/^[ \t\r\n]{0,10}$/)).map(
        ([d, e, c]) => make(`${d}/${file}${e}`, c, "empty file")
      );
    default:
      // Over the limit in bytes, using ASCII or 2-byte characters.
      return fc.tuple(pick(DIRS), pick(OK_EXT), fc.boolean()).map(([d, e, wide]) =>
        make(
          `${d}/${file}${e}`,
          wide ? "é".repeat(MAX_FILE_BYTES / 2 + 1) : "a".repeat(MAX_FILE_BYTES + 1),
          "file too large"
        )
      );
  }
}

const casesArb: fc.Arbitrary<readonly Case[]> = fc
  .array(fc.integer({ min: 0, max: 8 }), { minLength: 1, maxLength: 20 })
  .chain((kinds) => fc.tuple(...kinds.map((k, i) => caseFor(k, i))));

describe("Feature: bring-your-own-code, Property 2: Eligibility classification matches the Glossary rule", () => {
  it("loads exactly the eligible files and skips the rest with the matching reason", () => {
    fc.assert(
      fc.property(casesArb, (cases) => {
        const result = loadCode(cases.map((c) => c.candidate));
        const loaded = new Set(result.files.map((f) => f.filePath));
        const reasons = new Map(result.skipped.map((s) => [s.path, s.reason]));
        for (const { candidate, expected } of cases) {
          if (expected === "loaded") {
            expect(loaded.has(candidate.path)).toBe(true);
            expect(reasons.has(candidate.path)).toBe(false);
          } else {
            expect(loaded.has(candidate.path)).toBe(false);
            expect(reasons.get(candidate.path)).toBe(expected);
          }
        }
        expect(result.files.length + result.skipped.length).toBe(cases.length);
      }),
      { numRuns: 100 }
    );
  });

  it("loads a file of exactly 102,400 bytes and skips one byte more", () => {
    fc.assert(
      fc.property(pick(OK_EXT), (ext) => {
        const atLimit = { path: `src/a${ext}`, content: "a".repeat(MAX_FILE_BYTES) };
        const over = { path: `src/b${ext}`, content: "a".repeat(MAX_FILE_BYTES + 1) };
        const result = loadCode([atLimit, over]);
        expect(result.files.map((f) => f.filePath)).toEqual([atLimit.path]);
        expect(result.skipped).toEqual([{ path: over.path, reason: "file too large" }]);
      }),
      { numRuns: 100 }
    );
  });
});
