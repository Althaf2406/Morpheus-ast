/**
 * tests/pbt/mutation-diff.pbt.test.ts
 *
 * Properties of the mutation diff and the text fingerprint, through createEngine():
 *
 *   P1 — Hunks rebuild both texts exactly: applying the hunks to the mutated text with
 *        their "context + removed" lines gives the original, and applying them to the
 *        original with their "context + added" lines gives the mutated text.
 *       A "reindent" line counts on both sides: `beforeText` before, `text` after.
 *   P2 — No mutation, no hunk (also when every splice replaces text by itself).
 *   P3 — Fingerprint: equal for identical text, different for different text.
 *   P4 — A "reindent" line differs from its before text only in leading whitespace.
 *   P5 — Splices that only insert indentation at line starts give one reindent line per
 *        touched line and no removed or added line; the hunks still rebuild both texts.
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
    const lines = hunk.lines
      .filter((l) => l.kind !== keep)
      .map((l) => (side === "before" && l.kind === "reindent" ? l.beforeText! : l.text));
    const start = side === "before" ? hunk.afterStartLine : hunk.beforeStartLine;
    const count = side === "before" ? hunk.afterLineCount : hunk.beforeLineCount;
    result = replaceLines(result, start, count, lines);
  }
  return result;
}

/** Lines with random indentation, and splices that insert extra indentation at the start of some lines. */
const indentCaseArb = fc
  .array(
    fc.tuple(fc.constantFrom("", " ", "  ", "\t"), fc.constantFrom("a", "b c", "", "x;")),
    { minLength: 1, maxLength: 12 }
  )
  .chain((lines) =>
    fc
      .tuple(fc.array(fc.boolean(), { minLength: lines.length, maxLength: lines.length }), fc.constantFrom(" ", "  ", "\t"))
      .map(([picks, unit]) => {
        const source = lines.map(([indent, body]) => indent + body).join("\n");
        const splices: SpliceRange[] = [];
        let offset = 0;
        lines.forEach(([indent, body], i) => {
          if (picks[i]) {
            splices.push({ filePath: FILE_PATH, startIndex: offset, endIndex: offset, replacement: unit, description: "indent" });
          }
          offset += indent.length + body.length + 1;
        });
        return { source, splices };
      })
  )
  .filter(({ splices }) => splices.length > 0);
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

describe("mutation diff re-indentation (PBT)", () => {
  it("P4: a reindent line differs from its before text only in leading whitespace", () => {
    fc.assert(
      fc.property(fc.oneof(caseArb, indentCaseArb.map((c) => ({ ...c, contextLines: 2 }))), ({ source, splices, contextLines }) => {
        const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, splices);
        const { hunks } = engine.computeMutationDiff(rollbackRecord, mutatedSource, contextLines);
        for (const line of hunks.flatMap((h) => h.lines).filter((l) => l.kind === "reindent")) {
          expect(line.beforeText).toBeDefined();
          expect(line.beforeText).not.toBe(line.text);
          expect(line.beforeText!.trimStart()).toBe(line.text.trimStart());
          expect(line.beforeLine).not.toBeNull();
          expect(line.afterLine).not.toBeNull();
        }
      }),
      { numRuns: RUNS, seed: 213 }
    );
  });
  it("P5: indentation-only splices become reindent lines, and the hunks still rebuild both texts", () => {
    fc.assert(
      fc.property(indentCaseArb, fc.integer({ min: 0, max: 3 }), ({ source, splices }, contextLines) => {
        const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, splices);
        const { hunks } = engine.computeMutationDiff(rollbackRecord, mutatedSource, contextLines);
        const lines = hunks.flatMap((h) => h.lines);
        expect(lines.filter((l) => l.kind === "reindent")).toHaveLength(splices.length);
        expect(lines.filter((l) => l.kind === "added" || l.kind === "removed")).toHaveLength(0);
        expect(rebuild(mutatedSource, hunks, "before")).toBe(source);
        expect(rebuild(source, hunks, "after")).toBe(mutatedSource);
      }),
      { numRuns: RUNS, seed: 214 }
    );
  });
});
describe("mutation diff and fingerprint (examples)", () => {
  it("shows a re-indented line once, next to a really added line", () => {
    const source = "f() {\n  a();\n}";
    const open: SpliceRange = { filePath: FILE_PATH, startIndex: 6, endIndex: 8, replacement: "  try {\n    ", description: "open" };
    const { mutatedSource, rollbackRecord } = engine.applyMutationToText(source, [open]);
    const [hunk] = engine.computeMutationDiff(rollbackRecord, mutatedSource, 0).hunks;
    expect(hunk!.lines.map((l) => `${l.kind}:${l.beforeText ?? ""}|${l.text}`)).toEqual([
      "added:|  try {",
      "reindent:  a();|    a();",
    ]);
  });
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
