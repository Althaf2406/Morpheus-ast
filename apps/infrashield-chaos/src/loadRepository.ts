/**
 * apps/infrashield-chaos/src/loadRepository.ts
 *
 * Pure helpers for loading a user-supplied repository. Imports only contracts;
 * the adapter composes these with the engine.
 */

import type {
  LoadSummary,
  ParsedFile,
  SkippedFile,
  VirtualFile,
} from "../../../packages/morpheus-ast-core/src/contracts.js";

/** Outcome of a load attempt. `L` is the layout type the UI renders. */
export type LoadOutcomeOf<L> =
  | {
      readonly ok: true;
      readonly layout: L;
      /** Counts after parse-error exclusion. */
      readonly summary: LoadSummary;
      readonly filesAnalyzed: number;
      readonly findingsCount: number;
      /** Every file that was not analysed, with the reason. */
      readonly skipped: readonly SkippedFile[];
    }
  | { readonly ok: false; readonly message: string };

export const NO_FILES_MESSAGE =
  "No supported source files were found. Supported extensions: .ts, .tsx, .js, .jsx, .mjs, .cjs.";

export const NO_FUNCTIONS_MESSAGE = "No functions were found in the loaded code.";

export function failure(message: string): { readonly ok: false; readonly message: string } {
  return { ok: false, message };
}

/** Splits files into those that parsed cleanly and "parse error" skips. */
export function excludeParseErrors(
  files: readonly VirtualFile[],
  parsed: readonly ParsedFile[]
): { readonly kept: readonly VirtualFile[]; readonly skipped: readonly SkippedFile[] } {
  const broken = new Set(parsed.filter((p) => p.hasErrors).map((p) => p.filePath));
  return {
    kept: files.filter((f) => !broken.has(f.filePath)),
    skipped: files
      .filter((f) => broken.has(f.filePath))
      .map((f): SkippedFile => ({ path: f.filePath, reason: "parse error" })),
  };
}

/** Counts for the files actually analysed and everything skipped. */
export function buildSummary(kept: readonly VirtualFile[], skipped: readonly SkippedFile[]): LoadSummary {
  const encoder = new TextEncoder();
  return {
    loadedCount: kept.length,
    totalBytes: kept.reduce((sum, f) => sum + encoder.encode(f.sourceText).length, 0),
    skippedCount: skipped.length,
  };
}
