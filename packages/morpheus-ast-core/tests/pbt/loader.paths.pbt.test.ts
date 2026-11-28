/**
 * tests/pbt/loader.paths.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 6: Path normalisation is idempotent and slash/dot-insensitive
 *
 * **Validates: Requirements 1.10**
 */

import * as fc from "fast-check";
import { loadCode, normalizePath } from "../../src/loader/index.js";

const NUM_RUNS = 100;

const segmentArb = fc.constantFrom("src", "lib", "util", "a", "b", "core", "x.y");
const nameArb = fc.constantFrom("index", "main", "app", "util", "data");
const extArb = fc.constantFrom(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs");

/** A canonical eligible path: forward slashes, no leading "./". */
const canonicalArb = fc
  .tuple(fc.array(segmentArb, { maxLength: 3 }), nameArb, extArb)
  .map(([dirs, name, ext]) => [...dirs, name + ext].join("/"));

/** Arbitrary text, including backslashes and leading "./" runs, for idempotence. */
const rawPathArb = fc
  .tuple(
    fc.constantFrom("", "./", "././", ".\\", "\\"),
    fc.stringOf(fc.constantFrom("a", "b", ".", "/", "\\", "-", "_"), { maxLength: 20 })
  )
  .map(([prefix, rest]) => prefix + rest);

/** A variant of a canonical path: optional "./" prefixes and optional backslash separators. */
const variantOf = (canonical: string, dots: number, backslash: boolean): string => {
  const body = backslash ? canonical.split("/").join("\\") : canonical;
  return "./".repeat(dots) + body;
};

const variantArb = fc.tuple(fc.nat({ max: 3 }), fc.boolean());

describe("Feature: bring-your-own-code, Property 6: Path normalisation is idempotent and slash/dot-insensitive", () => {
  it("normalizePath is idempotent", () => {
    fc.assert(
      fc.property(fc.oneof(rawPathArb, fc.string({ maxLength: 20 })), (path) => {
        const once = normalizePath(path);
        expect(normalizePath(once)).toBe(once);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("converts backslashes to '/' and removes a leading './'", () => {
    fc.assert(
      fc.property(canonicalArb, variantArb, (canonical, [dots, backslash]) => {
        const variant = variantOf(canonical, dots, backslash);
        const normalised = normalizePath(variant);
        expect(normalised).toBe(canonical);
        expect(normalised.includes("\\")).toBe(false);
        expect(normalised.startsWith("./")).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it("loaded and skipped paths in a Load_Result are normalised", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(canonicalArb, variantArb, fc.boolean()), { maxLength: 12 }),
        (entries) => {
          const candidates = entries.map(([canonical, [dots, backslash], empty]) => ({
            path: variantOf(canonical, dots, backslash),
            content: empty ? "" : "const a = 1;",
          }));
          const result = loadCode(candidates);
          const paths = [...result.files.map((f) => f.filePath), ...result.skipped.map((s) => s.path)];
          for (const p of paths) {
            expect(p.includes("\\")).toBe(false);
            expect(p.startsWith("./")).toBe(false);
            expect(normalizePath(p)).toBe(p);
          }
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it("path variants collide as duplicates, keeping the first in input order", () => {
    fc.assert(
      fc.property(canonicalArb, variantArb, variantArb, (canonical, [d1, b1], [d2, b2]) => {
        const first = variantOf(canonical, d1, b1);
        const second = variantOf(canonical, d2, b2);
        const result = loadCode([
          { path: first, content: "const a = 1;" },
          { path: second, content: "const b = 2;" },
        ]);
        expect(result.files.map((f) => f.filePath)).toEqual([canonical]);
        expect(result.skipped).toEqual([{ path: canonical, reason: "duplicate path" }]);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
