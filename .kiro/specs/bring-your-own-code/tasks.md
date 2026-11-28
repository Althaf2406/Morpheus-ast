# Implementation Plan: Bring Your Own Code

## Overview

Implementation language: TypeScript (`strict: true`, no `any`). Every new or modified source file stays under 150 lines. Work proceeds in this order: core loader and GitHub helper, then contracts and engine wiring, then core tests, then app adapters, then the Load_Dialog UI, then the `?repo=` URL parameter, then final verification.

Core test files go in `packages/morpheus-ast-core/tests/pbt/`. App tests go next to the code they cover, in each app's existing `__tests__` folders. Each property test uses fast-check with at least 100 runs and the tag `Feature: bring-your-own-code, Property N: <title>`.

## Tasks

- [x] 1. Core loader and GitHub helper modules
  - [x] 1.1 Add loader and GitHub types to `packages/morpheus-ast-core/src/contracts.ts`
    - Add `CandidateFile`, `SkipReason`, `SkippedFile`, `LoadSummary`, `LoadResult`, `LoadCode`, `RepositoryRef`, `GitHubFetchError`, `FetchGitHubRepository`, `ParseRepositoryRef`
    - Reuse the existing `VirtualFile` type for `LoadResult.files`
    - Use domain-agnostic names and comments only
    - _Requirements: 3.1, 3.3_

  - [x] 1.2 Implement the Code_Loader in `packages/morpheus-ast-core/src/loader/index.ts`
    - Implement `normalizePath`, `isTestFile`, `isEligiblePath` and `loadCode`
    - Skip with the matching Skip_Reason: unsupported type, ignored folder, test file, empty file, file too large (over 102,400 UTF-8 bytes)
    - Deduplicate by normalised path (first in input order wins), then sort by path in code-point order
    - Apply Load_Limits (60 files, 409,600 bytes) and mark the rest "limit exceeded"
    - Return a `LoadResult` with a computed `summary`; never throw for expected conditions
    - Keep the file under 150 lines; split a helper module in `src/loader/` if needed
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.4a, 1.4b, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 3.3_

  - [x] 1.3 Implement the GitHub_Helper in `packages/morpheus-ast-core/src/loader/github.ts`
    - Implement `parseRepositoryRef` for `owner/name` and `https://github.com/owner/name`
    - Implement `fetchGitHubRepository(ref, fetchFn)` with an injected `fetch`, no Authorization header, and no token
    - Resolve the default branch, list the recursive tree, and fetch content only for paths accepted by `isEligiblePath`
    - Map 403/429 to `rate-limit` (message suggests paste or upload), 404 to `not-found`, thrown fetch to `network`, bad reference to `format`
    - Record a single failed file download as "download failed" in `skipped` and continue
    - Pass fetched files through `loadCode` and merge skip lists; return all errors as values
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 3.3_

- [x] 2. Engine contracts and wiring
  - [x] 2.1 Expose the loader and helper through `MorpheusASTEngine` and `createEngine()`
    - Add `loadCode`, `fetchGitHubRepository`, `parseRepositoryRef` to the `MorpheusASTEngine` interface in `contracts.ts`
    - Import and return them in `packages/morpheus-ast-core/src/index.ts`
    - Confirm the core imports nothing from `apps/` and that `lint:boundaries` still passes
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Core tests
  - [x] 3.1 Write loader example tests in `tests/pbt/loader.unit.test.ts`
    - One example per ignored folder, per eligible extension, and per Test_File pattern
    - Size boundaries at exactly 102,400 bytes and exactly 409,600 total bytes; 60-file boundary
    - _Requirements: 1.2, 1.3, 1.4, 1.4a, 1.4b, 1.6, 1.7, 1.8_

  - [x] 3.2 Write property test for exactly-once partitioning in `tests/pbt/loader.partition.pbt.test.ts`
    - **Property 1: Every candidate is loaded or skipped exactly once**
    - **Validates: Requirements 1.1, 9.3**

  - [x] 3.3 Write property test for eligibility classification in `tests/pbt/loader.eligibility.pbt.test.ts`
    - **Property 2: Eligibility classification matches the Glossary rule**
    - Covers wrong extension, ignored folder, Test_File and over-100 KB files never being loaded
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.4a, 1.4b, 9.5, 9.5a**

  - [x] 3.4 Write property test for Load_Limits in `tests/pbt/loader.limits.pbt.test.ts`
    - **Property 3: Load_Limits are never exceeded, and overflow is a success, not a failure**
    - **Validates: Requirements 1.6, 1.8, 9.1**

  - [x] 3.5 Write property test for limit-exceeded ordering in `tests/pbt/loader.ordering.pbt.test.ts`
    - **Property 4: Files skipped for "limit exceeded" sort after every loaded file**
    - **Validates: Requirements 1.5, 1.7, 9.4**

  - [x] 3.6 Write property test for permutation invariance in `tests/pbt/loader.permutation.pbt.test.ts`
    - **Property 5: Load_Result is invariant under input permutation**
    - **Validates: Requirements 1.9, 9.2**

  - [x] 3.7 Write property test for path normalisation in `tests/pbt/loader.paths.pbt.test.ts`
    - **Property 6: Path normalisation is idempotent and slash/dot-insensitive**
    - **Validates: Requirements 1.10**

  - [x] 3.8 Write property test for duplicate paths in `tests/pbt/loader.duplicates.pbt.test.ts`
    - **Property 7: Duplicate normalised paths keep the first, skip the rest**
    - **Validates: Requirements 1.11**

  - [x] 3.9 Write property test for reference parsing round trip in `tests/pbt/github.parse.pbt.test.ts`
    - **Property 8: Repository reference parsing round-trips**
    - **Validates: Requirements 2.1**

  - [x] 3.10 Write property test for unparseable references in `tests/pbt/github.format.pbt.test.ts`
    - **Property 9: Unparseable references yield a format error**
    - **Validates: Requirements 2.2**

  - [x] 3.11 Write property test for anonymous requests in `tests/pbt/github.anonymous.pbt.test.ts`
    - **Property 10: GitHub requests never carry an Authorization header or token**
    - **Validates: Requirements 2.3, 9.6**

  - [x] 3.12 Write property test for eligible-only fetching in `tests/pbt/github.eligible.pbt.test.ts`
    - **Property 11: Only eligible paths have their content fetched**
    - **Validates: Requirements 2.4**

  - [x] 3.13 Write property test for partial download failure in `tests/pbt/github.partial.pbt.test.ts`
    - **Property 12: A partial download failure skips only the failed files**
    - **Validates: Requirements 2.9, 2.10, 9.6**

  - [x] 3.14 Write GitHub_Helper example tests with a mocked `fetch` in `tests/pbt/github.unit.test.ts`
    - Cover success, HTTP 403, HTTP 429, HTTP 404, network failure, and a partial file failure
    - Assert the Rate_Limit_Error message suggests paste or upload and that no Authorization header is sent
    - _Requirements: 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 9.6_

  - [x] 3.15 Write property test for rollback on loaded code in `tests/pbt/loaded-rollback.pbt.test.ts`
    - **Property 13: Rollback of a mutation on loaded code is byte-identical**
    - Seed sources from a `LoadResult`, apply a non-overlapping splice batch, roll back, compare text
    - **Validates: Requirements 6.3, 9.9**

- [x] 4. Checkpoint - Core complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. App adapters
  - [x] 5.1 Add load methods to `apps/infrashield-chaos/src/adapter.ts`
    - Add `loadFromCandidates`, `loadFromGitHub`, `backToSample`, `isLoadedRepositoryActive` and the `LoadOutcome` type
    - Snapshot `virtualSources`, replace them from the `LoadResult`, run `reanalyzeVirtual`, and clear fault, patch, mutation and selection state as `reset()` does
    - Exclude files with parse errors and report them as "parse error"
    - On zero files, zero functions, or a GitHub error, restore the snapshot and return `{ ok: false, message }`
    - Keep loaded source in memory only; extract helpers into a new module if the file would reach 150 lines
    - _Requirements: 3.5, 5.1, 5.3, 5.5, 5.6, 5.7, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.5_

  - [x] 5.2 Add load methods to `apps/necro-compiler-game/src/adapter.ts`
    - Add the same method set and `LoadOutcome` type, using the dungeon layout
    - Clear selection, spell history and mutation state on every repository switch
    - Same failure, rollback and parse-error behaviour as 5.1
    - Extract helpers into a new module if the file would reach 150 lines
    - _Requirements: 3.5, 5.1, 5.3, 5.4, 5.6, 5.7, 6.1, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 7.5_

  - [x] 5.3 Write property test for failed loads in both apps
    - Files: `apps/infrashield-chaos/src/__tests__/loadFailure.pbt.test.ts`, `apps/necro-compiler-game/src/__tests__/loadFailure.pbt.test.ts`
    - **Property 14: A failed load leaves the active repository unchanged**
    - **Validates: Requirements 5.7**

  - [x] 5.4 Write property test for state clearing in both apps
    - Files: `apps/infrashield-chaos/src/__tests__/loadClearsState.pbt.test.ts`, `apps/necro-compiler-game/src/__tests__/loadClearsState.pbt.test.ts`
    - **Property 15: A repository switch clears all prior derived state**
    - **Validates: Requirements 5.6**

  - [x] 5.5 Write property test for parse-error files in both apps
    - Files: `apps/infrashield-chaos/src/__tests__/loadParseError.pbt.test.ts`, `apps/necro-compiler-game/src/__tests__/loadParseError.pbt.test.ts`
    - **Property 16: Files that fail to parse are skipped without blocking the rest**
    - **Validates: Requirements 7.5**

  - [x] 5.6 Write adapter example tests for replace, restore and empty results in both apps
    - Files: `apps/infrashield-chaos/src/__tests__/loadAdapter.test.ts`, `apps/necro-compiler-game/src/__tests__/loadAdapter.test.ts`
    - A loaded repository replaces the sample and `backToSample` restores it
    - Zero supported files returns the "no supported source files" message and lists extensions
    - Zero functions returns "no functions were found" and keeps the previous repository
    - Patch apply and rollback on loaded code returns byte-identical source
    - _Requirements: 5.1, 5.3, 5.7, 6.3, 7.1, 7.2, 9.7, 9.9_

- [x] 6. Checkpoint - Adapters complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Load_Dialog UI
  - [x] 7.1 Build the Load_Dialog in `apps/infrashield-chaos/src/components/load/`
    - Files: `LoadDialog.tsx`, `PasteTab.tsx`, `UploadTab.tsx`, `GitHubTab.tsx`, `LoadSummaryView.tsx`, `useLoadDialog.ts`
    - Paste submits one file named `pasted.ts`; Upload reads files or a folder with relative paths; GitHub takes `owner/name` or a URL
    - `useLoadDialog` states: idle, submitting, error, success; disable submit controls while submitting; keep input on error
    - Show loaded count, total KB, skipped count, and each skipped path with its reason
    - Keyboard operable tabs with accessible labels on every tab and input
    - Import only from `../../adapter`, never from the core package
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 3.5_

  - [x] 7.2 Build the Load_Dialog in `apps/necro-compiler-game/src/hud/load/`
    - Same file set, behaviour and accessibility as 7.1, styled with the existing HUD conventions
    - Import only from `../../adapter`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 3.5_

  - [x] 7.3 Wire the Load_Dialog into `apps/infrashield-chaos/src/App.tsx`
    - Add a "Load your code" control that opens the dialog
    - Rebuild the city when a load is accepted
    - Show a "Back to sample repository" control while a loaded repository is active
    - Show messages for no call edges and for no findings instead of empty panels
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 6.4, 7.3, 7.4_

  - [x] 7.4 Wire the Load_Dialog into `apps/necro-compiler-game/src/App.tsx`
    - Add a "Load your code" control that opens the dialog
    - Rebuild the dungeon when a load is accepted
    - Show a "Back to sample repository" control while a loaded repository is active
    - Show messages for no call edges and for no findings instead of empty panels
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.4, 7.3, 7.4_

  - [x] 7.5 Write Load_Dialog component tests for both apps
    - Files: `apps/infrashield-chaos/src/components/load/__tests__/LoadDialog.test.tsx`, `apps/necro-compiler-game/src/hud/load/__tests__/LoadDialog.test.tsx`
    - Tabs render and are keyboard operable; controls are disabled while submitting
    - Error keeps the dialog open with input intact; success shows summary and skipped list
    - "Back to sample repository" appears only while a loaded repository is active
    - _Requirements: 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.2, 7.3, 7.4_

- [x] 8. Repository URL parameter
  - [x] 8.1 Add `useRepoParam` to `apps/infrashield-chaos` and use it in `App.tsx`
    - Read `repo` on mount; for a valid value, open the dialog on the GitHub tab pre-filled and start the load
    - For an invalid value, keep the sample active and show the format error from `parseRepositoryRef`
    - Use `history.replaceState` to set `?repo=owner/name` after a successful GitHub load and to remove it on "Back to sample repository"
    - On a failed param-triggered load, keep the sample and show the error in the dialog
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.2 Add `useRepoParam` to `apps/necro-compiler-game` and use it in `App.tsx`
    - Same behaviour as 8.1
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.3 Write Repo_Param tests for both apps
    - Files: `apps/infrashield-chaos/src/__tests__/repoParam.test.tsx`, `apps/necro-compiler-game/src/__tests__/repoParam.test.tsx`
    - Valid param opens the GitHub tab pre-filled and loads (mocked `fetch`)
    - Invalid param keeps the sample and shows the format error
    - Success updates the address bar; "Back to sample repository" removes the param; failure keeps the sample
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.8_

- [x] 9. Final verification
  - Run `pnpm run lint:boundaries` and confirm zero violations
  - Run `pnpm run typecheck` and confirm zero errors
  - Run the core test suite and each app's test suite (single run, no watch mode) and confirm zero failing tests
  - Confirm every new or modified source file is under 150 lines and contains no `any`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 3.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design (Properties 1 to 16)
- Unit tests validate specific examples and edge cases
- The loader and helper stay domain-agnostic: no application vocabulary in identifiers or comments under `packages/morpheus-ast-core/`
- Only `apps/*/src/adapter.ts` imports `packages/morpheus-ast-core/src/index`; UI code imports from `./adapter` only

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3", "5.4", "5.5", "5.6"] },
    { "id": 8, "tasks": ["6"] },
    { "id": 9, "tasks": ["7.1", "7.2"] },
    { "id": 10, "tasks": ["7.3", "7.4"] },
    { "id": 11, "tasks": ["7.5"] },
    { "id": 12, "tasks": ["8.1", "8.2"] },
    { "id": 13, "tasks": ["8.3"] },
    { "id": 14, "tasks": ["9"] }
  ]
}
```
