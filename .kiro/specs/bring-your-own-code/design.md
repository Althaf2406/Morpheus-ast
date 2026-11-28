# Design Document

## Overview

This feature adds a domain-agnostic **Code_Loader** and **GitHub_Helper** to `packages/morpheus-ast-core`, exposed through `contracts.ts` and `createEngine()`, and a **Load_Dialog** UI in each app that calls them exclusively through `apps/*/src/adapter.ts`. Loaded code replaces the sample repository in memory; the existing virtual-source flows (spell casting, fault injection, surgical mutation, security scan, bugfix spec) already operate on `VirtualFile`/in-memory sources, so they need no new core logic — only the ability to seed `virtualSources` from a `Load_Result` instead of `getSampleRepository()`.

Two new core modules are added:

- `packages/morpheus-ast-core/src/loader/index.ts` — the `CodeLoader` (Requirement 1).
- `packages/morpheus-ast-core/src/loader/github.ts` — the `GitHubHelper` (Requirement 2).

Each app adds a `Load_Dialog` component tree and a small amount of adapter surface (new public methods on `InfraShieldAdapter` / `NecroCompilerAdapter`, no change to their private mutation/fault/spell logic).

## Architecture

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│ apps/infrashield-chaos      │        │ apps/necro-compiler-game     │
│  LoadDialog (Paste/Upload/  │        │  LoadDialog (Paste/Upload/   │
│  GitHub tabs)                │        │  GitHub tabs)                │
│        │ calls                │        │        │ calls                │
│        ▼                     │        │        ▼                     │
│  adapter.ts                  │        │  adapter.ts                  │
│   loadFromCandidates()       │        │   loadFromCandidates()       │
│   loadFromGitHub()            │        │   loadFromGitHub()            │
│   backToSample()              │        │   backToSample()              │
└──────────────┬────────────────┘        └──────────────┬────────────────┘
               │ createEngine()                           │ createEngine()
               ▼                                           ▼
      ┌────────────────────────────────────────────────────────┐
      │ packages/morpheus-ast-core/src/index.ts (createEngine)  │
      │   loadCode(candidates)        → Load_Result             │
      │   fetchGitHubRepository(ref, fetchFn) → Load_Result|Err │
      └───────────────┬───────────────────────┬──────────────────┘
                       ▼                       ▼
            src/loader/index.ts      src/loader/github.ts
            (CodeLoader: filter,     (GitHubHelper: parse ref,
             sort, limit, dedupe)     list tree, fetch content,
                                      map HTTP errors)
```

`contracts.ts` gains the new types and two facade functions; no existing type changes. `src/loader/github.ts` depends only on `src/loader/index.ts`'s eligibility predicate (both live in the same module family, keeping the unidirectional rule: loader → contracts, never loader → apps).

## Components and Interfaces

### Core: `contracts.ts` additions

```typescript
/** A file offered to the Code_Loader, before eligibility filtering. */
export interface CandidateFile {
  readonly path: string;
  readonly content: string;
}

/** Why a candidate file did not become a loaded file. */
export type SkipReason =
  | "unsupported type"
  | "ignored folder"
  | "empty file"
  | "test file"
  | "file too large"
  | "limit exceeded"
  | "duplicate path"
  | "download failed"
  | "parse error";

export interface SkippedFile {
  readonly path: string;
  readonly reason: SkipReason;
}

export interface LoadSummary {
  readonly loadedCount: number;
  readonly totalBytes: number;
  readonly skippedCount: number;
}

/** Output of the Code_Loader: a bounded, deterministic set of files to analyse. */
export interface LoadResult {
  readonly files: readonly VirtualFile[];
  readonly skipped: readonly SkippedFile[];
  readonly summary: LoadSummary;
}

/** Turns candidate files into a bounded Load_Result. Pure; no file system or network. */
export type LoadCode = (candidates: readonly CandidateFile[]) => LoadResult;

/** A parsed `owner/name` repository reference. */
export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

/** A GitHub fetch failure, returned as a value. */
export interface GitHubFetchError {
  readonly kind: "format" | "rate-limit" | "not-found" | "network";
  readonly message: string;
}

/** Fetches a public GitHub repository's eligible files with no token, using an injected `fetch`. */
export type FetchGitHubRepository = (
  ref: string,
  fetchFn: typeof fetch
) => Promise<{ readonly ok: true; readonly result: LoadResult } | { readonly ok: false; readonly error: GitHubFetchError }>;

/** Parses `owner/name` or a `https://github.com/owner/name` URL. Returns null when unparseable. */
export type ParseRepositoryRef = (value: string) => RepositoryRef | null;
```

`MorpheusASTEngine` gains:

```typescript
readonly loadCode: LoadCode;
readonly fetchGitHubRepository: FetchGitHubRepository;
readonly parseRepositoryRef: ParseRepositoryRef;
```

### Core: `src/loader/index.ts` (CodeLoader)

Pure functions, no I/O:

- `isEligiblePath(path: string): boolean` — extension allow-list, ignored-folder segments (`node_modules`, `dist`, `build`, `.git`), `.d.ts` exclusion, `isTestFile(path)` exclusion.
- `isTestFile(path: string): boolean` — `__tests__` path segment, or basename ending in `.test` / `.spec` before the final extension.
- `normalizePath(path: string): string` — backslashes to `/`, strip leading `./`.
- `loadCode(candidates: readonly CandidateFile[]): LoadResult` — the orchestrator:
  1. Normalise every path.
  2. Partition into eligible / skipped-with-reason (unsupported type, ignored folder, test file, empty file, file too large), checking test-file and size independently of the 400 KB/60-file budget (Requirement 1.4a/1.4b).
  3. Deduplicate by normalised path, first occurrence in input order wins; later duplicates skipped as "duplicate path" (Requirement 1.11) — this runs before sorting, so "first in input order" is well defined regardless of final sort order.
  4. Sort the remaining eligible files by path in ascending code-point order (`a.path < b.path` with plain string comparison, which is code-point order for BMP characters).
  5. Walk the sorted list, accumulating `files` and `totalBytes` (UTF-8 byte length via `Buffer.byteLength`/`TextEncoder`), stopping before any file that would push the loaded count past 60 or the total past 409,600 bytes; every file from that point on is skipped as "limit exceeded", preserving their relative order.
  6. Build `summary` from the final `files`/`skipped` arrays.

### Core: `src/loader/github.ts` (GitHubHelper)

- `parseRepositoryRef(value: string): RepositoryRef | null` — accepts `owner/name` (simple two-segment path, no slashes inside segments) or `https://github.com/owner/name[...]`, validated against GitHub's allowed identifier charset (`[A-Za-z0-9-_.]+`).
- `fetchGitHubRepository(ref, fetchFn)`:
  1. Parse `ref`; on failure return `{ ok: false, error: { kind: "format", message: "Expected \"owner/name\" or a github.com/owner/name URL." } }`.
  2. Call the GitHub REST API's repo endpoint (to resolve the default branch) then the git-trees API (`recursive=1`) using `fetchFn`, sending no `Authorization` header.
  3. Map transport/HTTP outcomes to `GitHubFetchError`: 403/429 → `kind: "rate-limit"` with a message suggesting paste/upload; 404 → `kind: "not-found"`; thrown/rejected fetch → `kind: "network"`.
  4. Filter the tree to blob entries whose path is eligible per `isEligiblePath` (so content is fetched only for files that could end up loaded, per Requirement 2.4) and fetch each file's raw content with `fetchFn`.
  5. If an individual file's content fetch fails while the overall listing succeeded, record it as a `CandidateFile`-level failure that `loadCode` will see as already absent — instead, this module builds a synthetic skip entry with reason `"download failed"` directly in the resulting `LoadResult.skipped`, and excludes that file from the candidate list passed to `loadCode` (Requirement 2.9).
  6. Pass the successfully fetched files through `loadCode()` and merge its `skipped` list with the "download failed" entries from step 5, then return `{ ok: true, result }`.
  7. Never throw for the failure cases above; all are returned as values (Requirement 2.10).

### Core: `index.ts` wiring

```typescript
import { loadCode } from "./loader/index.js";
import { fetchGitHubRepository, parseRepositoryRef } from "./loader/github.js";
// ...inside createEngine() return object:
loadCode,
fetchGitHubRepository,
parseRepositoryRef,
```

### App: adapter additions (both apps, same shape)

Each adapter already keeps a `virtualSources: Map<string, string>` and a `healthySnapshot`/sample-based re-analysis path (`reanalyzeVirtual`, `restoreVirtualSources` in InfraShield; `virtualSources` + `reanalyzeVirtual` in Necro). New methods added to each, calling only `this.engine` and existing private helpers:

```typescript
// Shape added to InfraShieldAdapter and NecroCompilerAdapter alike.
async loadFromCandidates(candidates: readonly CandidateFile[]): Promise<LoadOutcome>;
async loadFromGitHub(ref: string, fetchFn: typeof fetch = fetch): Promise<LoadOutcome>;
backToSample(): Promise<Layout>;   // CyberCityLayout | DungeonLayout
isLoadedRepositoryActive(): boolean;
```

`LoadOutcome` (new UI-facing type per app, named for its app's vocabulary but structurally identical):

```typescript
export type LoadOutcome =
  | { readonly ok: true; readonly layout: CyberCityLayout /* or DungeonLayout */; readonly summary: LoadSummary; readonly skipped: readonly SkippedFile[] }
  | { readonly ok: false; readonly message: string };
```

Behavior, implemented with existing private helpers (`restoreVirtualSources`/`reanalyzeVirtual` style methods already present):

1. `loadFromCandidates` calls `engine.loadCode(candidates)`. If `files.length === 0`, return `{ ok: false, message: "No supported source files were found. Supported: .ts, .tsx, .js, .jsx, .mjs, .cjs" }` (Requirement 7.1) without touching the active repository (Requirement 5.7).
2. Otherwise, snapshot the current `virtualSources` as a rollback point, clear and repopulate `virtualSources` from `result.files`, call the existing `reanalyzeVirtual()`, and clear fault/patch/mutation/selection state exactly as `reset()` already does (Requirement 5.6). If `reanalyzeVirtual()'s` resulting graph has zero functions, restore the snapshot, keep the old repository active, and return `{ ok: false, message: "No functions were found in the loaded code." }` (Requirement 7.2).
3. On success, record `isLoadedRepositoryActive = true` and return `{ ok: true, layout, summary, skipped }`.
4. `loadFromGitHub` calls `engine.fetchGitHubRepository(ref, fetchFn)`; on `ok: false` it returns `{ ok: false, message: error.message }` without changing state (Requirement 5.7); on `ok: true` it calls the same path as step 2 with `result.files` already resolved (passing them to `loadCode`-shaped candidates is unnecessary since the engine already ran `loadCode`; the adapter instead takes `result.files`/`skipped`/`summary` directly).
5. `backToSample()` calls `loadSampleRepository()`'s existing body (InfraShield) or the equivalent sample-loading path (Necro), sets `isLoadedRepositoryActive = false`, and clears the same state as `reset()`.
6. Files that fail to parse (`ParsedFile.hasErrors === true`) are surfaced from `reanalyzeVirtual`'s underlying `parseSourceFiles` call; the adapter filters these out of `virtualSources` before building the graph and adds them to the returned `skipped` list with reason `"parse error"` (Requirement 7.5), so a bad file never blocks the rest.

### App: `LoadDialog` component (both apps, parallel structure)

```
src/components/load/              (infrashield-chaos)
src/hud/load/                     (necro-compiler-game, grouped with other hud/* dialogs)
  LoadDialog.tsx        — tab container, open/close, a11y labelling (Requirement 4.9)
  PasteTab.tsx           — textarea + submit; builds one CandidateFile named "pasted.ts" (Req 4.2)
  UploadTab.tsx          — <input type="file" multiple webkitdirectory>, reads File→text, relative paths (Req 4.3)
  GitHubTab.tsx          — text field for owner/name or URL; wired to Repo_Param pre-fill (Req 8.1)
  LoadSummaryView.tsx     — success summary + skipped list (Req 4.7, 4.8)
  useLoadDialog.ts        — state machine: idle | submitting | error | success; disables controls while submitting (Req 4.5); keeps input on error (Req 4.6)
```

`useLoadDialog` calls `adapter.loadFromCandidates` / `adapter.loadFromGitHub` and never imports `morpheus-ast-core` directly, matching each app's existing adapter-only boundary.

### App: `?repo=` URL parameter (Requirement 8)

A small hook (`useRepoParam.ts`) in each app, used by `App.tsx` alongside the existing `useAdapterLoader`:

1. On mount, read `repo` from `window.location.search`. If present and matches `owner/name` syntactically (cheap client-side check before calling the engine), open `LoadDialog` on the GitHub tab pre-filled and trigger `loadFromGitHub` (Req 8.1–8.2).
2. If the engine's `parseRepositoryRef` rejects it, keep the sample active and surface the engine's format error in the dialog (Req 8.3).
3. On any successful GitHub load through the dialog (whether from the param or manual entry), call `history.replaceState` to set/update `?repo=owner/name` (Req 8.4).
4. On `backToSample()`, call `history.replaceState` to remove the `repo` param (Req 8.5).
5. On a param-triggered load failure, keep the sample active and show the error in the dialog (Req 8.6).

## Data Models

```typescript
// contracts.ts (see Components section for full definitions)
CandidateFile { path, content }
SkipReason = "unsupported type" | "ignored folder" | "empty file" | "test file"
           | "file too large" | "limit exceeded" | "duplicate path"
           | "download failed" | "parse error"
SkippedFile { path, reason }
LoadSummary { loadedCount, totalBytes, skippedCount }
LoadResult { files: VirtualFile[], skipped: SkippedFile[], summary }
RepositoryRef { owner, name }
GitHubFetchError { kind, message }
```

`LoadResult.files` reuses the existing `VirtualFile` type (`{ filePath, sourceText }`), so no adapter code needs to translate between a new file shape and the one `parseSourceFiles`/`virtualFiles` already consumes.

## Error Handling

| Failure | Where caught | Surfaced as |
|---|---|---|
| Candidate not eligible / empty / test file / too large | `loadCode` (pure) | `SkippedFile` entry, never thrown |
| Over Load_Limits | `loadCode` (pure) | `SkippedFile` entries with "limit exceeded", `LoadResult` still `ok`-shaped |
| Duplicate normalised path | `loadCode` (pure) | `SkippedFile` entry "duplicate path" |
| Unparseable repo ref | `fetchGitHubRepository` | `{ ok: false, error: { kind: "format" } }` |
| GitHub 403/429 | `fetchGitHubRepository` | `{ ok: false, error: { kind: "rate-limit" } }`, message suggests paste/upload |
| GitHub 404 | `fetchGitHubRepository` | `{ ok: false, error: { kind: "not-found" } }` |
| Network/transport throw | `fetchGitHubRepository` (try/catch around `fetchFn`) | `{ ok: false, error: { kind: "network" } }` |
| One file's content fetch fails | `fetchGitHubRepository` | `SkippedFile` "download failed" in the returned `LoadResult`, other files proceed |
| Zero loaded files | Adapter (`loadFromCandidates`/`loadFromGitHub`) | `LoadOutcome.ok === false`, repository unchanged |
| Zero functions after load | Adapter | `LoadOutcome.ok === false`, previous repository restored |
| File parses with errors | Adapter (`reanalyzeVirtual` / `parseSourceFiles`) | Excluded from graph build, added to `skipped` as "parse error", load still succeeds overall |
| Dialog-level failure (any of the above surfaced via adapter) | `useLoadDialog` | Error text shown, dialog stays open, user's input preserved |

All core-side error paths return values; nothing in `loader/index.ts` or `loader/github.ts` throws for an expected condition (unexpected bugs still throw and are a defect, not a modeled path).

## Testing Strategy

- **Unit/example tests**: eligibility edge cases (one example per ignored folder, per extension, per test-file pattern, boundary at exactly 100 KB and 400 KB), the four GitHub HTTP outcomes (403, 429, 404, network throw) with a mocked `fetchFn`, the "no Authorization header" assertion, each app's Load_Dialog tab rendering and a11y labelling, the Repo_Param bootstrap flows (valid, invalid, success, failure), and the empty-files/empty-functions/no-edges/no-findings UI messages.
- **Property tests**: see Correctness Properties below, each with ≥100 fast-check iterations, tagged `Feature: bring-your-own-code, Property N: <title>`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Every candidate is loaded or skipped exactly once

For any list of candidate files, `loadCode` partitions them so that every input file (by original index) appears in exactly one of `files` or `skipped`, and `summary.loadedCount + summary.skippedCount` equals the number of input files.

**Validates: Requirements 1.1**

### Property 2: Eligibility classification matches the Glossary rule

For any path and content, a candidate file is loaded only if its normalised path has an eligible extension, is not under `node_modules`, `dist`, `build` or `.git`, is not a `.d.ts` file, is not a Test_File, is not empty or whitespace-only, and its UTF-8 byte length is at most 102,400; otherwise it is skipped with the Skip_Reason that matches the specific rule it failed ("unsupported type", "ignored folder", "test file", "empty file", or "file too large").

**Validates: Requirements 1.2, 1.3, 1.4, 1.4a, 1.4b**

### Property 3: Load_Limits are never exceeded, and overflow is a success, not a failure

For any list of eligible files, `loadCode` never returns more than 60 files in `files` or more than 409,600 total UTF-8 bytes across `files`, and it always returns a normally-shaped `LoadResult` (never throws, never reports a distinct "too large" failure) regardless of how far the input exceeds the limits.

**Validates: Requirements 1.6, 1.8, 9.1**

### Property 4: Files skipped for "limit exceeded" sort after every loaded file

For any list of eligible files, every file whose Skip_Reason is "limit exceeded" has a normalised path that is greater than or equal to the normalised path of every loaded file, and the loaded files themselves are in ascending code-point order.

**Validates: Requirements 1.5, 1.7, 9.4**

### Property 5: Load_Result is invariant under input permutation

For any list of candidate files and any permutation of that list, `loadCode` returns a `LoadResult` whose `files`, `skipped` (as a set of path/reason pairs) and `summary` are identical to the result for the original order, except that which of two candidates sharing a normalised path is kept as "loaded" vs. "duplicate path" follows that permutation's input order.

**Validates: Requirements 1.9, 9.2, 9.3**

### Property 6: Path normalisation is idempotent and slash/dot-insensitive

For any path, and any variant of that path formed by substituting `/` for `\` or prepending `./`, `loadCode` treats both variants as the same normalised path (so they collide as duplicates), and normalising an already-normalised path returns it unchanged.

**Validates: Requirements 1.10**

### Property 7: Duplicate normalised paths keep the first, skip the rest

For any list of candidate files containing two or more entries that normalise to the same path, `loadCode` loads or evaluates only the first such entry in input order for eligibility, and every later entry with that normalised path is skipped with the Skip_Reason "duplicate path".

**Validates: Requirements 1.11**

### Property 8: Repository reference parsing round-trips

For any owner and name composed of GitHub's allowed identifier characters, parsing the string `owner/name` and parsing the URL `https://github.com/owner/name` both yield a `RepositoryRef` equal to `{ owner, name }`.

**Validates: Requirements 2.1**

### Property 9: Unparseable references yield a format error

For any string that is neither of the form `owner/name` nor a `https://github.com/owner/name` URL, `parseRepositoryRef` returns `null`, and `fetchGitHubRepository` resolves to `{ ok: false, error: { kind: "format" } }` whose message states the expected `owner/name` format.

**Validates: Requirements 2.2**

### Property 10: GitHub requests never carry an Authorization header or token

For any repository reference and any mocked `fetchFn`, every request `fetchGitHubRepository` issues through `fetchFn` has no `Authorization` header and no token in its URL or body.

**Validates: Requirements 2.3**

### Property 11: Only eligible paths have their content fetched

For any mocked repository file listing containing a mix of eligible and ineligible paths, `fetchGitHubRepository` calls `fetchFn` for file content only for the paths that `isEligiblePath` accepts.

**Validates: Requirements 2.4**

### Property 12: A partial download failure skips only the failed files

For any mocked repository listing and any non-empty subset of files whose content fetch is made to fail, `fetchGitHubRepository` still resolves with `ok: true`, includes every other file's content successfully, lists each failed file in `skipped` with the Skip_Reason "download failed", and never rejects or throws.

**Validates: Requirements 2.9, 2.10**

### Property 13: Rollback of a mutation on loaded code is byte-identical

For any loaded repository (a `LoadResult`'s files used to seed `virtualSources`) and any non-overlapping, in-bounds splice batch applied to one of its files, applying the mutation and then rolling it back with `rollbackMutationText`/`rollbackLastSpell`/`rollbackLastMutation` restores the file's text to be exactly equal, character for character, to its text before the mutation.

**Validates: Requirements 6.3, 9.9**

### Property 14: A failed load leaves the active repository unchanged

For any active repository (sample or previously loaded) and any load attempt that fails (zero files, zero functions, or a GitHub error), the set of file paths and their text in the active repository after the attempt is identical to the set before the attempt.

**Validates: Requirements 5.7**

### Property 15: A repository switch clears all prior derived state

For any active repository with an arbitrary non-empty combination of selected function, active fault, applied patch and mutation/undo history, successfully loading a new repository or returning to the sample leaves the selected function, active fault, applied patch and history all at their empty/initial values.

**Validates: Requirements 5.6**

### Property 16: Files that fail to parse are skipped without blocking the rest

For any loaded repository containing an arbitrary non-empty subset of files with unparseable content mixed with otherwise-valid files, the application includes every unparseable file in `skipped` with the Skip_Reason "parse error" and completes analysis using the remaining files.

**Validates: Requirements 7.5**

## Property Reflection

- Properties 3 and 4 both concern the Load_Limits boundary; they are kept separate because Property 3 is a bound (never exceed N files/bytes, success-shaped result) while Property 4 is an ordering guarantee (which specific files get cut and in what order) — collapsing them would hide the ordering requirement (1.5/1.7) inside a pure-count check.
- Property 5 (permutation invariance) subsumes what would otherwise be a separate "duplicate-first-wins is order-dependent" property; Property 7 instead focuses on the within-a-single-order duplicate rule, which Property 5 explicitly carves out as the one permutation-sensitive exception. No redundancy remains between them.
- Property 2 consolidates the five original per-rule skip-reason checks (1.3, 1.4, 1.4a, 1.4b plus the extension/folder half of 1.2) into one classification property, since they are all instances of the same "skip reason matches the failed rule" statement over one shared predicate.
- Property 12 covers both 2.9 (partial failure handling) and 2.10 (errors as values) for the partial-failure case; 2.10's other sub-cases (403/429/404/network) are example-based per the prework, since they are fixed mappings from a status code rather than input-varying behavior, so no property would add coverage beyond the examples.
- Requirement 9.6 (GitHub mocked-fetch coverage across all six failure modes) is satisfied by the example tests for Properties 9, 12 plus the dedicated 403/429/404/network examples noted in Testing Strategy; no additional property is needed.
