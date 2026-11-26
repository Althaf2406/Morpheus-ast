/**
 * mutator/index.ts
 *
 * Surgical Line-Range AST Splice & Rollback engine.
 *
 * Governance (.kiro/steering/ast-surgical-splice.md):
 *   - All mutations use precise [startIndex, endIndex) offset-range splices.
 *   - Splices are applied in DESCENDING startIndex order to avoid offset drift.
 *   - Overlapping ranges throw SpliceConflictError before any mutation.
 *   - Every mutation stores a RollbackRecord for byte-perfect reversal.
 */

import type {
  MutationRequest,
  MutationResult,
  RollbackRecord,
  SpliceRange,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Custom errors
// ─────────────────────────────────────────────────────────────────────────────

export class SpliceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpliceConflictError";
  }
}

export class MutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MutationError";
  }
}

type Segment = RollbackRecord["originalSegments"][number];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers shared by the file-backed and in-memory paths
// ─────────────────────────────────────────────────────────────────────────────

/** True when `index` sits between the two halves of a surrogate pair. */
export function splitsSurrogatePair(source: string, index: number): boolean {
  if (index <= 0 || index >= source.length) return false;
  const before = source.charCodeAt(index - 1);
  const after = source.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** Validates a batch and returns it sorted by startIndex, descending. */
function prepareBatch(source: string, splices: readonly SpliceRange[]): SpliceRange[] {
  const sorted = [...splices].sort((a, b) => b.startIndex - a.startIndex);

  for (const s of sorted) {
    if (s.startIndex < 0 || s.endIndex > source.length) {
      throw new MutationError(
        `Splice [${s.startIndex}, ${s.endIndex}) out of bounds for source of length ${source.length}.`
      );
    }
    if (s.startIndex > s.endIndex) {
      throw new MutationError(
        `Splice has startIndex (${s.startIndex}) > endIndex (${s.endIndex}).`
      );
    }
    for (const boundary of [s.startIndex, s.endIndex]) {
      if (splitsSurrogatePair(source, boundary)) {
        throw new MutationError(
          `Splice boundary ${boundary} falls inside a UTF-16 surrogate pair. ` +
            `Writing the result as UTF-8 would corrupt the file.`
        );
      }
    }
  }

  // Descending order: sorted[i] starts at or after sorted[i + 1].
  for (let i = 0; i + 1 < sorted.length; i++) {
    const later = sorted[i]!;
    const earlier = sorted[i + 1]!;
    if (earlier.endIndex > later.startIndex) {
      throw new SpliceConflictError(
        `Overlapping splices: [${earlier.startIndex},${earlier.endIndex}) overlaps ` +
          `[${later.startIndex},${later.endIndex}). ` +
          `Descriptions: "${earlier.description}" / "${later.description}"`
      );
    }
  }
  return sorted;
}

/** Applies a validated, descending-sorted batch. Also builds the rollback segments. */
function applySorted(
  source: string,
  sorted: readonly SpliceRange[]
): { mutated: string; segments: Segment[] } {
  const segments: Segment[] = sorted.map((s) => ({
    startIndex: s.startIndex,
    originalText: source.slice(s.startIndex, s.endIndex),
    replacementLength: s.replacement.length,
  }));

  let mutated = source;
  for (const s of sorted) {
    mutated = mutated.slice(0, s.startIndex) + s.replacement + mutated.slice(s.endIndex);
  }
  return { mutated, segments };
}

/**
 * Restores the original text. Segment offsets are in original coordinates, so each
 * segment's position in the mutated text is shifted by the length change of every
 * earlier segment. Segments are then restored from the end backwards.
 */
export function restoreSegments(mutated: string, segments: readonly Segment[]): string {
  const ascending = [...segments].sort((a, b) => a.startIndex - b.startIndex);

  const located: { mutatedStart: number; seg: Segment }[] = [];
  let shift = 0;
  for (const seg of ascending) {
    located.push({ mutatedStart: seg.startIndex + shift, seg });
    shift += seg.replacementLength - seg.originalText.length;
  }

  let restored = mutated;
  for (let i = located.length - 1; i >= 0; i--) {
    const { mutatedStart, seg } = located[i]!;
    restored =
      restored.slice(0, mutatedStart) +
      seg.originalText +
      restored.slice(mutatedStart + seg.replacementLength);
  }
  return restored;
}

function newMutationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SurgicalMutator
// ─────────────────────────────────────────────────────────────────────────────

export class SurgicalMutator {
  /** Applies a single-file batch of non-overlapping splices and writes the result. */
  async apply(request: MutationRequest): Promise<MutationResult> {
    const startMs = Date.now();

    if (request.splices.length === 0) {
      throw new MutationError("MutationRequest contains zero splices.");
    }

    const filePaths = new Set(request.splices.map((s) => s.filePath));
    if (filePaths.size > 1) {
      throw new MutationError(
        `A single MutationRequest batch must target exactly one file. ` +
          `Got ${filePaths.size} distinct paths: ${[...filePaths].join(", ")}`
      );
    }

    const filePath = request.splices[0]!.filePath;
    // Lazy import keeps the in-memory path usable in a browser bundle.
    const { readFile, writeFile } = await import("fs/promises");
    const original = await readFile(filePath, "utf-8");

    const sorted = prepareBatch(original, request.splices);
    const { mutated, segments } = applySorted(original, sorted);

    await writeFile(filePath, mutated, "utf-8");

    const mutationId = newMutationId("mutation");
    return {
      mutationId,
      filePath,
      splicesApplied: sorted.length,
      mutatedSource: mutated,
      rollbackRecord: {
        mutationId,
        filePath,
        originalSegments: segments,
        appliedAt: Date.now(),
      },
      durationMs: Date.now() - startMs,
    };
  }

  /** Restores the file to its pre-mutation content using the rollback record. */
  async rollback(record: RollbackRecord): Promise<void> {
    const { readFile, writeFile } = await import("fs/promises");
    const current = await readFile(record.filePath, "utf-8");
    await writeFile(record.filePath, restoreSegments(current, record.originalSegments), "utf-8");
  }

  /** In-memory apply, used by PBT (no file I/O). */
  applyToString(
    source: string,
    splices: readonly SpliceRange[]
  ): { mutated: string; rollbackRecord: RollbackRecord } {
    if (splices.length === 0) {
      throw new MutationError("Cannot apply zero splices.");
    }
    const sorted = prepareBatch(source, splices);
    const { mutated, segments } = applySorted(source, sorted);
    const mutationId = newMutationId("pbt");
    return {
      mutated,
      rollbackRecord: {
        mutationId,
        filePath: splices[0]!.filePath,
        originalSegments: segments,
        appliedAt: Date.now(),
      },
    };
  }

  /** In-memory rollback, used by PBT (no file I/O). */
  rollbackString(mutated: string, record: RollbackRecord): string {
    return restoreSegments(mutated, record.originalSegments);
  }
}
