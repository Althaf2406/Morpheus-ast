/**
 * Code loader: turns candidate files into a bounded, deterministic LoadResult.
 * Pure. No file system, no network, never throws for expected conditions.
 */

import type {
  CandidateFile,
  LoadResult,
  SkipReason,
  SkippedFile,
  VirtualFile,
} from "../contracts.js";

export const MAX_FILE_BYTES = 102_400;
export const MAX_FILES = 60;
export const MAX_TOTAL_BYTES = 409_600;

const EXTENSIONS: readonly string[] = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const IGNORED_FOLDERS: readonly string[] = ["node_modules", "dist", "build", ".git"];

/** Backslashes become forward slashes and any leading "./" prefixes are removed. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

const TEST_FOLDERS: readonly string[] = [
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "__mocks__",
  "e2e",
  "fixtures",
  "__fixtures__",
  "test-d",
  "type-tests",
  "types-test",
  "benchmark",
  "benchmarks",
];
const TEST_STEMS: readonly string[] = ["test", "tests", "spec"];
const TEST_STEM_SUFFIXES: readonly string[] = [".test", ".spec", ".test-d", ".e2e", ".bench"];

/**
 * True for a file inside a test-like folder (test, tests, __tests__, spec, specs, __mocks__, e2e,
 * fixtures), a file whose stem is test, tests or spec, or a stem ending in .test, .spec, .test-d,
 * .e2e or .bench. Comparison is case-insensitive.
 */
export function isTestFile(path: string): boolean {
  const segments = normalizePath(path).split("/");
  const name = segments[segments.length - 1] ?? "";
  if (segments.slice(0, -1).some((s) => TEST_FOLDERS.includes(s.toLowerCase()))) return true;
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
  return TEST_STEMS.includes(stem) || TEST_STEM_SUFFIXES.some((suffix) => stem.endsWith(suffix));
}

/** The reason a path can never be loaded, or null when the path is eligible. */
function pathSkipReason(path: string): SkipReason | null {
  const segments = normalizePath(path).split("/");
  const name = segments[segments.length - 1] ?? "";
  if (!EXTENSIONS.some((ext) => name.endsWith(ext)) || name.endsWith(".d.ts")) {
    return "unsupported type";
  }
  if (segments.slice(0, -1).some((s) => IGNORED_FOLDERS.includes(s))) return "ignored folder";
  if (isTestFile(path)) return "test file";
  return null;
}

/** True when the path has a supported extension, is outside ignored folders and is not a test file. */
export function isEligiblePath(path: string): boolean {
  return pathSkipReason(path) === null;
}

/** UTF-8 byte length of a string (lone surrogates count as 3 bytes, like TextEncoder). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Ascending code-point order (differs from UTF-16 order for astral characters). */
function compareCodePoints(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i]?.codePointAt(0) ?? 0) - (right[i]?.codePointAt(0) ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

interface Sized {
  readonly file: VirtualFile;
  readonly bytes: number;
}

export function loadCode(candidates: readonly CandidateFile[]): LoadResult {
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  const eligible: Sized[] = [];

  for (const candidate of candidates) {
    const path = normalizePath(candidate.path);
    if (seen.has(path)) {
      skipped.push({ path, reason: "duplicate path" });
      continue;
    }
    seen.add(path);
    const bytes = utf8ByteLength(candidate.content);
    const reason =
      pathSkipReason(path) ??
      (candidate.content.trim() === "" ? "empty file" : null) ??
      (bytes > MAX_FILE_BYTES ? "file too large" : null);
    if (reason !== null) skipped.push({ path, reason });
    else eligible.push({ file: { filePath: path, sourceText: candidate.content }, bytes });
  }

  eligible.sort((a, b) => compareCodePoints(a.file.filePath, b.file.filePath));

  const files: VirtualFile[] = [];
  let totalBytes = 0;
  let full = false;
  for (const { file, bytes } of eligible) {
    if (!full && files.length < MAX_FILES && totalBytes + bytes <= MAX_TOTAL_BYTES) {
      files.push(file);
      totalBytes += bytes;
    } else {
      full = true;
      skipped.push({ path: file.filePath, reason: "limit exceeded" });
    }
  }

  skipped.sort(
    (a, b) => compareCodePoints(a.path, b.path) || compareCodePoints(a.reason, b.reason)
  );
  return {
    files,
    skipped,
    summary: { loadedCount: files.length, totalBytes, skippedCount: skipped.length },
  };
}
