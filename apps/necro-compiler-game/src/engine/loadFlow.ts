/**
 * Pure helpers for loading a user's repository into the dungeon.
 * Imports only contracts (the adapter is the sole composition root).
 */

import type {
  LoadSummary,
  ParsedFile,
  SkippedFile,
  VirtualFile,
} from "../../../../packages/morpheus-ast-core/src/contracts.js";
import type { DungeonLayout } from "../adapter.ts";

export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;

export const NO_FILES_MESSAGE = `No supported source files were found. Supported file types: ${SUPPORTED_EXTENSIONS.join(", ")}.`;
export const NO_FUNCTIONS_MESSAGE = "No functions were found in the loaded code.";

/** Result of a load attempt, shaped for the UI. */
export type LoadOutcome =
  | {
      readonly ok: true;
      readonly layout: DungeonLayout;
      readonly summary: LoadSummary;
      readonly skipped: readonly SkippedFile[];
      /** Number of files that were analysed. */
      readonly filesAnalyzed: number;
      /** Number of monsters (findings) in the new dungeon. */
      readonly findingsCount: number;
    }
  | { readonly ok: false; readonly message: string };

/** Splits loaded files into those that parse cleanly and "parse error" skips. */
export function excludeParseErrors(
  files: readonly VirtualFile[],
  parsed: readonly ParsedFile[]
): { readonly good: readonly VirtualFile[]; readonly parseErrors: readonly SkippedFile[] } {
  const broken = new Set(parsed.filter((p) => p.hasErrors).map((p) => p.filePath));
  return {
    good: files.filter((f) => !broken.has(f.filePath)),
    parseErrors: files
      .filter((f) => broken.has(f.filePath))
      .map((f): SkippedFile => ({ path: f.filePath, reason: "parse error" })),
  };
}

/** Summary of a load result after parse-error files were removed from it. */
export function adjustedSummary(good: readonly VirtualFile[], skipped: readonly SkippedFile[]): LoadSummary {
  const encoder = new TextEncoder();
  return {
    loadedCount: good.length,
    totalBytes: good.reduce((sum, f) => sum + encoder.encode(f.sourceText).length, 0),
    skippedCount: skipped.length,
  };
}
