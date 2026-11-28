/**
 * tests/pbt/loaded-rollback.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 13: Rollback of a mutation on loaded code is byte-identical
 *
 * Files produced by loadCode() (LoadResult.files as VirtualFile[]) are mutated with
 * non-overlapping splices; rollback restores the exact text and the mutated text re-parses
 * with zero syntax errors.
 *
 * **Validates: Requirements 6.3, 9.9**
 */
import * as fc from "fast-check";
import * as ts from "typescript";
import { createEngine } from "../../src/index.js";
import type { CandidateFile, SpliceRange, VirtualFile } from "../../src/contracts.js";

const engine = createEngine();
const NUM_RUNS = 100;

/** A valid TypeScript module made of simple functions with numeric literals. */
const sourceArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 999 }), { minLength: 1, maxLength: 6 })
  .map((nums) =>
    nums
      .map(
        (n, i) =>
          `export function fn${i}(x: number): number {\n  const r = x * ${n};\n  return r + ${i};\n}\n`
      )
      .join("\n")
  );

const candidatesArb: fc.Arbitrary<CandidateFile[]> = fc
  .array(sourceArb, { minLength: 1, maxLength: 4 })
  .map((sources) => sources.map((content, i) => ({ path: `src/mod${i}.ts`, content })));

const replacementArb = fc.constantFrom("0", "7", "12345", "(1 + 2)", "x");
const commentArb = fc.constantFrom("/* c */ ", "// note\n", "/**/");

/** Builds a non-overlapping batch: numeric-literal replacements plus line-start comment insertions. */
function buildSplices(
  file: VirtualFile,
  picks: readonly number[],
  repl: string,
  comment: string
): SpliceRange[] {
  const text = file.sourceText;
  const splices: SpliceRange[] = [];
  const literals = [...text.matchAll(/\* (\d+);/g)];
  const lineStarts = [...text.matchAll(/^export function/gm)];
  const used = new Set<number>();
  picks.forEach((pick, k) => {
    const pool = k % 2 === 0 ? literals : lineStarts;
    if (pool.length === 0) return;
    const m = pool[pick % pool.length];
    const isLiteral = k % 2 === 0;
    const start = isLiteral ? (m.index ?? 0) + 2 : (m.index ?? 0);
    const end = isLiteral ? start + m[1].length : start;
    if (used.has(start)) return;
    used.add(start);
    splices.push({
      filePath: file.filePath,
      startIndex: start,
      endIndex: end,
      replacement: isLiteral ? repl : comment,
      description: "loaded-code splice",
    });
  });
  return splices;
}

function syntaxErrorCount(source: string): number {
  const out = ts.transpileModule(source, { reportDiagnostics: true, fileName: "x.ts" });
  return (out.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error).length;
}

describe("Feature: bring-your-own-code, Property 13: rollback of a mutation on loaded code is byte-identical", () => {
  it("apply then rollback restores loaded file text exactly; mutated text has zero syntax errors", () => {
    fc.assert(
      fc.property(
        candidatesArb,
        fc.array(fc.nat({ max: 50 }), { minLength: 1, maxLength: 6 }),
        replacementArb,
        commentArb,
        fc.nat({ max: 10 }),
        (candidates, picks, repl, comment, fileSeed) => {
          const loaded = engine.loadCode(candidates);
          expect(loaded.files.length).toBeGreaterThan(0);

          const file = loaded.files[fileSeed % loaded.files.length];
          const splices = buildSplices(file, picks, repl, comment);
          if (splices.length === 0) return;

          const { mutatedSource, rollbackRecord } = engine.applyMutationToText(
            file.sourceText,
            splices
          );
          expect(syntaxErrorCount(mutatedSource)).toBe(0);

          const restored = engine.rollbackMutationText(mutatedSource, rollbackRecord);
          expect(restored).toBe(file.sourceText);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
