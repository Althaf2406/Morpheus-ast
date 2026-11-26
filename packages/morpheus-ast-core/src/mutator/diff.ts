/**
 * mutator/diff.ts
 *
 * Pure line diff of one mutation, built from its RollbackRecord and the mutated text.
 * Nothing here edits source text: the "before" text is recovered with the same
 * segment restore the rollback uses, and hunks only describe the difference.
 */

import type { DiffHunk, DiffLine, MutationDiff, RollbackRecord } from "../contracts.js";
import { restoreSegments } from "./index.js";

const DEFAULT_CONTEXT_LINES = 2;

/** Changed lines of one side pair, as 0-based inclusive line indexes. */
interface Region {
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** 0-based index of the line that contains `offset`. */
function lineIndexAt(text: string, offset: number): number {
  let count = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

/** One region per segment, in ascending order, locating each segment in both texts. */
function regionsOf(before: string, after: string, record: RollbackRecord): Region[] {
  const ascending = [...record.originalSegments].sort((x, y) => x.startIndex - y.startIndex);
  const regions: Region[] = [];
  let shift = 0;
  for (const seg of ascending) {
    const beforeStart = seg.startIndex;
    const beforeEnd = beforeStart + seg.originalText.length;
    const afterStart = beforeStart + shift;
    const afterEnd = afterStart + seg.replacementLength;
    if (afterEnd > after.length) {
      throw new RangeError("Mutated text is shorter than the rollback record describes.");
    }
    regions.push({
      b1: lineIndexAt(before, beforeStart),
      b2: lineIndexAt(before, beforeEnd),
      a1: lineIndexAt(after, afterStart),
      a2: lineIndexAt(after, afterEnd),
    });
    shift += seg.replacementLength - seg.originalText.length;
  }
  return regions;
}

/** Merges regions that share a line and drops regions whose lines did not change. */
function changedRegions(regions: readonly Region[], beforeLines: string[], afterLines: string[]): Region[] {
  const merged: Region[] = [];
  for (const region of regions) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && region.b1 <= prev.b2) {
      prev.b2 = Math.max(prev.b2, region.b2);
      prev.a2 = Math.max(prev.a2, region.a2);
    } else {
      merged.push({ ...region });
    }
  }
  return merged.filter(
    (r) => beforeLines.slice(r.b1, r.b2 + 1).join("\n") !== afterLines.slice(r.a1, r.a2 + 1).join("\n")
  );
}

/** Groups regions whose context windows touch, so one hunk never repeats a line. */
function groupRegions(regions: readonly Region[], contextLines: number): Region[][] {
  const groups: Region[][] = [];
  for (const region of regions) {
    const group = groups[groups.length - 1];
    const prev = group?.[group.length - 1];
    if (group !== undefined && prev !== undefined && region.b1 - prev.b2 - 1 <= 2 * contextLines) {
      group.push(region);
    } else {
      groups.push([region]);
    }
  }
  return groups;
}

function buildHunk(group: readonly Region[], beforeLines: string[], afterLines: string[], contextLines: number): DiffHunk {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  const lines: DiffLine[] = [];

  /** Unchanged lines [from, to) of the before text; `offset` maps them to after-text lines. */
  const addContext = (from: number, to: number, offset: number): void => {
    for (let i = from; i < to; i++) {
      lines.push({ kind: "context", text: beforeLines[i]!, beforeLine: i + 1, afterLine: i + 1 + offset });
    }
  };

  const start = Math.max(0, first.b1 - contextLines);
  addContext(start, first.b1, first.a1 - first.b1);
  group.forEach((region, k) => {
    for (let i = region.b1; i <= region.b2; i++) {
      lines.push({ kind: "removed", text: beforeLines[i]!, beforeLine: i + 1, afterLine: null });
    }
    for (let j = region.a1; j <= region.a2; j++) {
      lines.push({ kind: "added", text: afterLines[j]!, beforeLine: null, afterLine: j + 1 });
    }
    const next = group[k + 1];
    if (next !== undefined) addContext(region.b2 + 1, next.b1, region.a2 - region.b2);
  });
  addContext(last.b2 + 1, Math.min(beforeLines.length, last.b2 + 1 + contextLines), last.a2 - last.b2);

  return {
    beforeStartLine: start + 1,
    beforeLineCount: lines.filter((l) => l.kind !== "added").length,
    afterStartLine: start + (first.a1 - first.b1) + 1,
    afterLineCount: lines.filter((l) => l.kind !== "removed").length,
    lines,
  };
}

/** Diff of the mutation that produced `mutatedText` and `record`. */
export function computeMutationDiff(
  record: RollbackRecord,
  mutatedText: string,
  contextLines: number = DEFAULT_CONTEXT_LINES
): MutationDiff {
  const context = Math.max(0, Math.floor(contextLines));
  const before = restoreSegments(mutatedText, record.originalSegments);
  const regions = regionsOf(before, mutatedText, record);
  const beforeLines = before.split("\n");
  const afterLines = mutatedText.split("\n");
  const changed = changedRegions(regions, beforeLines, afterLines);
  return {
    mutationId: record.mutationId,
    filePath: record.filePath,
    hunks: groupRegions(changed, context).map((g) => buildHunk(g, beforeLines, afterLines, context)),
  };
}
