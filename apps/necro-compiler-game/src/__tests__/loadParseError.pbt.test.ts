// @vitest-environment node
/**
 * Feature: bring-your-own-code, Property 16: Files that fail to parse are skipped without blocking the rest
 *
 * Valid and syntactically broken files are loaded together through the real engine.
 * Broken files are reported as skipped with reason "parse error", valid files are
 * analysed, and the summary counts match.
 *
 * **Validates: Requirements 7.5**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createNecroAdapter } from "../adapter.ts";
import type { CandidateFile } from "../adapter.ts";

// --- Generators ---
const BROKEN_SNIPPETS = [
  "function broken( {{{ ;;",
  "export const = = 1; }}}",
  "class { method( }",
  "if (x) { return ; ) else (((",
] as const;

interface Mixed {
  readonly validCount: number;
  readonly brokenCount: number;
  readonly order: readonly boolean[];
}

/** A shuffled mix of at least one valid and at least one broken file. */
const mixedArb: fc.Arbitrary<Mixed> = fc
  .tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 }))
  .chain(([validCount, brokenCount]) =>
    fc
      .shuffledSubarray(
        [...Array(validCount + brokenCount).keys()],
        { minLength: validCount + brokenCount, maxLength: validCount + brokenCount }
      )
      .map((perm) => ({ validCount, brokenCount, order: perm.map((n) => n < validCount) }))
  );

function buildCandidates(mixed: Mixed, snippetIdx: number): CandidateFile[] {
  let v = 0;
  let b = 0;
  return mixed.order.map((isValid): CandidateFile => {
    if (isValid) {
      const i = v++;
      return { path: `src/ok${i}.ts`, content: `export function ok${i}() { return ${i}; }\n` };
    }
    const i = b++;
    return { path: `src/bad${i}.ts`, content: BROKEN_SNIPPETS[(snippetIdx + i) % BROKEN_SNIPPETS.length]! };
  });
}

// --- Property 16 ---
describe("Property 16: files that fail to parse are skipped without blocking the rest", () => {
  it("skips broken files as 'parse error', analyses valid ones, and keeps summary counts consistent", async () => {
    await fc.assert(
      fc.asyncProperty(mixedArb, fc.nat(BROKEN_SNIPPETS.length - 1), async (mixed, snippetIdx) => {
        const candidates = buildCandidates(mixed, snippetIdx);
        const adapter = createNecroAdapter();
        const outcome = await adapter.loadFromCandidates(candidates);

        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const parseSkips = outcome.skipped.filter((s) => s.reason === "parse error");
        const brokenPaths = candidates.filter((c) => c.path.startsWith("src/bad")).map((c) => c.path);
        expect(parseSkips.map((s) => s.path).sort()).toEqual([...brokenPaths].sort());

        const validCandidates = candidates.filter((c) => c.path.startsWith("src/ok"));
        expect(outcome.filesAnalyzed).toBe(mixed.validCount);
        expect(outcome.summary.loadedCount).toBe(mixed.validCount);
        expect(outcome.summary.skippedCount).toBe(outcome.skipped.length);
        expect(outcome.summary.skippedCount).toBe(mixed.brokenCount);
        const bytes = validCandidates.reduce((sum, c) => sum + new TextEncoder().encode(c.content).length, 0);
        expect(outcome.summary.totalBytes).toBe(bytes);

        for (const c of validCandidates) {
          expect(adapter.getSourceText(c.path)).toBe(c.content);
        }
        for (const path of brokenPaths) {
          expect(adapter.getSourceText(path)).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });
});
