/**
 * tests/pbt/mutation-diff.pbt.test.ts
 *
 * Properties of the mutation diff and the text fingerprint, through createEngine():
 *
 *   P1 — Hunks rebuild both texts exactly: applying the hunks to the mutated text with
 *        their "context + removed" lines gives the original, and applying them to the
 *        original with their "context + added" lines gives the mutated text.
 *   P2 — No mutation, no hunk (also when every splice replaces text by itself).
 *   P3 — Fingerprint: equal for identical text, different for different text.
 */
import * as fc from "fast-check";
import { createEngine } from "../../src/index.js";
import type { DiffHunk, RollbackRecord, SpliceRange } from "../../src/contracts.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");
const engine = createEngine();
const FILE_PATH = "synthetic/target.ts";

// --- Generators ---

const textArb = fc
  .array(fc.constantFrom("a", "b", "x y", "\n", "\n", "  "), { maxLength: 40 })
  .map((parts) => parts.join(""));

const replacementArb = fc
  .array(fc.constantFrom("Q", "z z", "\n", "\n\n", ""), { maxLength: 6 })
  .map((parts) => parts.join(""));

interface Case {
  readonly source: string;
  readonly splices: readonly SpliceRange[];
  readonly contextLines: number;
}

/** A source with 1-4 non-overlapping splices (touching ranges allowed). */
const caseArb: fc.Arbitrary<Case> = fc
  .tuple(textArb, fc.integer({ min: 1, max: 4 }), fc.integer({ min: 0, max: 4 }))
  .chain(([source, count, contextLines]) =>
    fc
      .tuple(
        fc.array(fc.integer({ min: 0, max: source.length }), { minLength: count * 2, maxLength: count * 2 }),
        fc.array(replacementArb, { minLength: count, maxLength: count })
      )
      .map(([offsets, replacements]) => {
        const sorted = [...offsets].sort((x, y) => x - y);
        const splices = replacements
          .map((replacement, i) => ({
            filePath: FILE_PATH,
            startIndex: sorted[2 * i]!,
            endIndex: sorted[2 * i + 1]!,
            replacement,
            description: "synthetic splice",
          }))
          // The mutator orders splices by start index, so two splices may not share one.
          .filter((s, i, all) => i === 0 || s.startIndex > all[i - 1]!.startIndex);
        return { source, splices, contextLines };
      })
  );

// --- Helpers ---

/** Replaces `count` lines at 1-based `startLine` of `text` by `lines`. */
function replaceLines(text: string, startLine: number, count: number, lines: readonly string[]): string {
  const all = text.split("\n");
  all.splice(startLine - 1, count, ...lines);
  return all.join("\n");
}

function rebuild(text: string, hunks: readonly DiffHunk[], side: "before" | "after"): string {
  let result = text;
  for (const hunk of [...hunks].reverse()) {
    const keep = side === "before" ? "added" : "removed";
    const lines = hunk.lines.filter((l) => l.kind !== keep).map((l) => l.text);
    const start = side === "before" ? hunk.afterStartLine : hunk.beforeStartLine;
    const count = side === "before" ? hunk.afterLineCount : hunk.beforeLineCount;
    result = replaceLines(result, start, count, lines);
  }
  return result;
}

// --- Properties ---

describe("mutation diff (PBT)", () => {
  it("P1: hunks rebuild the text before and after the mutation exactly", () => {
    fc.assert(
      fc.property(caseArb, ({ source, splices, contextLines }) => {
        const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, splices);
        const diff = engine.computeMutationDiff(rollbackRecord, mutatedSource, contextLines);
        expect(rebuild(mutatedSource, diff.hunks, "before")).toBe(source);
        expect(rebuild(source, diff.hunks, "after")).toBe(mutatedSource);
        expect(diff.filePath).toBe(FILE_PATH);
      }),
      { numRuns: RUNS, seed: 210 }
    );
  });

  it("P2: no mutation produces no hunk, and a splice that rewrites text onto itself neither", () => {
    fc.assert(
      fc.property(caseArb, ({ source, splices }) => {
        const empty: RollbackRecord = { mutationId: "none", filePath: FILE_PATH, originalSegments: [], appliedAt: 0 };
        expect(engine.computeMutationDiff(empty, source).hunks).toHaveLength(0);

        const identity = splices.map((s) => ({ ...s, replacement: source.slice(s.startIndex, s.endIndex) }));
        const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, identity);
        expect(mutatedSource).toBe(source);
        expect(engine.computeMutationDiff(rollbackRecord, mutatedSource).hunks).toHaveLength(0);
      }),
      { numRuns: RUNS, seed: 211 }
    );
  });

  it("P3: fingerprint is equal for identical text and different for different text", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }), async (a, b) => {
        const first = await engine.fingerprintText(a);
        expect(first).toMatch(/^[0-9a-f]{64}$/);
        expect(await engine.fingerprintText(a)).toBe(first);
        expect((await engine.fingerprintText(b)) === first).toBe(a === b);
      }),
      { numRuns: RUNS, seed: 212 }
    );
  });
});

describe("mutation diff and fingerprint (examples)", () => {
  it("reports line numbers and context for one changed line", () => {
    const source = "one\ntwo\nthree\nfour\nfive";
    const splice: SpliceRange = {
      filePath: FILE_PATH,
      startIndex: 8,
      endIndex: 13,
      replacement: "3",
      description: "shorten line 3",
    };
    const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, [splice]);
    const [hunk] = engine.computeMutationDiff(rollbackRecord, mutatedSource, 1).hunks;
    expect(hunk!.lines.map((l) => `${l.kind}:${l.text}`)).toEqual([
      "context:two",
      "removed:three",
      "added:3",
      "context:four",
    ]);
    expect([hunk!.beforeStartLine, hunk!.beforeLineCount]).toEqual([2, 3]);
    expect([hunk!.afterStartLine, hunk!.afterLineCount]).toEqual([2, 3]);
  });

  it("fingerprints the standard SHA-256 test vector", async () => {
    expect(await engine.fingerprintText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});
