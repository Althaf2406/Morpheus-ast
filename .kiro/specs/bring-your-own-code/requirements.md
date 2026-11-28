# Requirements Document

## Introduction

Both applications currently analyse a built-in sample repository. This feature lets a user bring their own code. A user can paste source text, upload files, or load a public GitHub repository, with no login and no token. The core engine gains a domain-agnostic loader that filters, orders and limits the incoming files, plus a GitHub fetch helper. Each application gains a "Load your code" dialog with Paste, Upload and GitHub tabs. Once loaded, the existing flows work on the user's code: rebuild the dungeon or city, cast and undo spells or inject faults, apply and roll back patches, inspect diffs, and generate a bugfix spec. A `?repo=owner/name` URL parameter pre-fills and starts a GitHub load.

Constraints that apply to all requirements: every source file stays under 150 lines, the TypeScript type `any` is not used, and `pnpm run lint:boundaries`, typecheck and the test suites pass. The core package contains no application vocabulary, and only `apps/*/src/adapter.ts` imports `packages/morpheus-ast-core/src/index`.

## Glossary

- **Core_Engine**: The package `packages/morpheus-ast-core`, the headless AST engine.
- **Code_Loader**: The Core_Engine module that turns a list of candidate files into a Load_Result under the Load_Limits.
- **GitHub_Helper**: The Core_Engine module that fetches a public GitHub repository's files over anonymous HTTPS and returns them as candidate files.
- **Candidate_File**: A file with a path and text content offered to the Code_Loader.
- **Eligible_File**: A Candidate_File whose extension is `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` or `.cjs`, whose path is not under `node_modules`, `dist`, `build` or `.git`, that is not a `.d.ts` file, that is not a Test_File, and whose content is at most 100 KB (102,400 bytes of UTF-8 text).
- **Test_File**: A Candidate_File whose path contains a `__tests__` folder segment, or whose filename (before its final extension) ends in `.test` or `.spec` (for example `foo.test.ts`, `bar.spec.tsx`).
- **Load_Limits**: At most 60 loaded files and at most 400 KB (409,600 bytes of UTF-8 text) of loaded content in total.
- **Load_Result**: An object with `files` (loaded VirtualFile list), `skipped` (list of path and reason) and `summary` (file count, total bytes, skipped count).
- **Skip_Reason**: A short string explaining why a file was skipped, such as "unsupported type", "ignored folder", "empty file" or "limit exceeded".
- **Sample_Repository**: The built-in repository each application loads on start.
- **Loaded_Repository**: The set of files most recently produced by the Code_Loader and accepted by an application.
- **Load_Dialog**: The "Load your code" dialog in each application, with Paste, Upload and GitHub tabs.
- **Adapter**: The `apps/*/src/adapter.ts` file of an application, its only composition root for the Core_Engine.
- **Infrashield_App**: The application in `apps/infrashield-chaos`, which renders a city.
- **Necro_App**: The application in `apps/necro-compiler-game`, which renders a dungeon.
- **Rate_Limit_Error**: A plain-English message shown when GitHub answers with HTTP 403 or 429, suggesting the user paste or upload code instead.
- **Repo_Param**: The URL query parameter `repo` with the value `owner/name`.

## Requirements

### Requirement 1: Code loader limits and determinism

**User Story:** As a developer, I want the core engine to turn arbitrary files into a bounded, analysable set, so that large or messy inputs load predictably.

#### Acceptance Criteria

1. WHEN the Code_Loader receives a list of Candidate_Files, THE Code_Loader SHALL return a Load_Result containing the loaded files, the skipped files with a Skip_Reason each, and a summary.
2. THE Code_Loader SHALL classify a Candidate_File as an Eligible_File according to its extension and folder as defined in the Glossary.
3. WHEN a Candidate_File is not an Eligible_File, THE Code_Loader SHALL list the file as skipped with the Skip_Reason "unsupported type" or "ignored folder".
4. WHEN a Candidate_File has empty or whitespace-only content, THE Code_Loader SHALL list the file as skipped with the Skip_Reason "empty file".
4a. WHEN a Candidate_File is a Test_File, THE Code_Loader SHALL list the file as skipped with the Skip_Reason "test file".
4b. WHEN a Candidate_File's content exceeds 100 KB (102,400 bytes of UTF-8 text), THE Code_Loader SHALL list the file as skipped with the Skip_Reason "file too large", independently of the Load_Limits in Requirement 1.6–1.8.
5. THE Code_Loader SHALL sort the Eligible_Files by path in ascending code-point order before applying the Load_Limits.
6. THE Code_Loader SHALL load Eligible_Files in sorted order until adding the next file would exceed 60 loaded files or 400 KB of total loaded content.
7. WHEN an Eligible_File would exceed the Load_Limits, THE Code_Loader SHALL list that file and every later Eligible_File as skipped with the Skip_Reason "limit exceeded".
8. THE Code_Loader SHALL return a successful Load_Result for an over-limit input and SHALL NOT report a "too large" failure.
9. WHEN the Code_Loader receives the same Candidate_Files in any order, THE Code_Loader SHALL return an identical Load_Result.
10. THE Code_Loader SHALL normalise backslash path separators to forward slashes and remove a leading "./" from each path.
11. IF two Candidate_Files have the same normalised path, THEN THE Code_Loader SHALL keep the first file in input order and list the later file as skipped with the Skip_Reason "duplicate path".

### Requirement 2: GitHub helper

**User Story:** As a developer, I want to load a public GitHub repository without a token, so that I can try the tools on real code in seconds.

#### Acceptance Criteria

1. WHEN the GitHub_Helper receives a value of the form `owner/name` or a `https://github.com/owner/name` URL, THE GitHub_Helper SHALL parse the owner and repository name.
2. IF the GitHub_Helper receives a value that cannot be parsed as a repository, THEN THE GitHub_Helper SHALL return an error message stating the expected `owner/name` format.
3. THE GitHub_Helper SHALL send anonymous requests with no Authorization header and no token.
4. WHEN the GitHub_Helper fetches a repository, THE GitHub_Helper SHALL list the repository's files at its default branch and fetch only the content of Eligible_Files.
5. THE GitHub_Helper SHALL accept the `fetch` function as an injected parameter so that tests can substitute a mock.
6. IF GitHub answers with HTTP 403 or 429, THEN THE GitHub_Helper SHALL return a Rate_Limit_Error that suggests pasting or uploading code instead.
7. IF GitHub answers with HTTP 404, THEN THE GitHub_Helper SHALL return an error message stating that the repository was not found or is not public.
8. IF a network failure occurs, THEN THE GitHub_Helper SHALL return an error message stating that GitHub could not be reached.
9. IF a fetch of one file fails while the others succeed, THEN THE GitHub_Helper SHALL list that file as skipped with the Skip_Reason "download failed" and continue.
10. THE GitHub_Helper SHALL return errors as values and SHALL NOT throw for the failure cases in this requirement.

### Requirement 3: Core contracts and boundaries

**User Story:** As a maintainer, I want the new core API exposed through the typed contracts, so that both apps consume it without breaking isolation rules.

#### Acceptance Criteria

1. THE Core_Engine SHALL declare the types of the Code_Loader, the GitHub_Helper, Load_Result and Skip_Reason in `packages/morpheus-ast-core/src/contracts.ts`.
2. THE Core_Engine SHALL expose the Code_Loader and the GitHub_Helper through the object returned by `createEngine()`.
3. THE Core_Engine SHALL contain no application vocabulary and no import from `apps/` in the new modules.
4. WHEN `pnpm run lint:boundaries` runs, THE Core_Engine SHALL produce zero violations.
5. THE Infrashield_App and the Necro_App SHALL reach the Code_Loader and the GitHub_Helper only through their Adapter.

### Requirement 4: Load your code dialog

**User Story:** As a user of either app, I want a "Load your code" dialog, so that I can supply my own code by pasting, uploading or fetching from GitHub.

#### Acceptance Criteria

1. THE Load_Dialog SHALL provide the tabs Paste, Upload and GitHub.
2. WHEN the user submits text on the Paste tab, THE Load_Dialog SHALL pass the text as one Candidate_File named `pasted.ts` to the Code_Loader.
3. WHEN the user chooses files or a folder on the Upload tab, THE Load_Dialog SHALL read them as text and pass them to the Code_Loader with their relative paths.
4. WHEN the user submits `owner/name` or a GitHub URL on the GitHub tab, THE Load_Dialog SHALL call the GitHub_Helper and pass the result to the Code_Loader.
5. WHILE a load is in progress, THE Load_Dialog SHALL show a loading state and disable the submit controls.
6. IF a load fails, THEN THE Load_Dialog SHALL show the error message in plain English and keep the dialog open with the user's input intact.
7. WHEN a load succeeds, THE Load_Dialog SHALL show a summary with the loaded file count, the total size in KB, and the skipped file count.
8. WHEN skipped files exist, THE Load_Dialog SHALL list each skipped path with its Skip_Reason.
9. THE Load_Dialog SHALL be operable by keyboard and SHALL label each tab and input for assistive technology.
10. THE Infrashield_App and the Necro_App SHALL each provide the Load_Dialog with the same tabs and behaviour.

### Requirement 5: Replace and restore the sample

**User Story:** As a user, I want my code to replace the sample and be restorable, so that I can explore my repo and return to the demo.

#### Acceptance Criteria

1. WHEN a load succeeds and the user accepts it, THE application SHALL replace the Sample_Repository with the Loaded_Repository as the active repository.
2. WHILE a Loaded_Repository is active, THE application SHALL show a "Back to sample repository" control.
3. WHEN the user activates "Back to sample repository", THE application SHALL restore the Sample_Repository as the active repository and discard the Loaded_Repository.
4. WHEN the active repository changes, THE Necro_App SHALL rebuild the dungeon from the new repository.
5. WHEN the active repository changes, THE Infrashield_App SHALL rebuild the city from the new repository.
6. WHEN the active repository changes, THE application SHALL clear any selected function, active fault, applied patch, and undo or rollback history that belongs to the previous repository.
7. IF a load fails, THEN THE application SHALL keep the previously active repository unchanged.

### Requirement 6: Existing features on loaded code

**User Story:** As a user, I want every existing feature to work on my code, so that bringing my own code is not a reduced experience.

#### Acceptance Criteria

1. WHEN a Loaded_Repository is active, THE Necro_App SHALL allow the user to cast and undo spells on the functions of the Loaded_Repository.
2. WHEN a Loaded_Repository is active, THE Infrashield_App SHALL allow the user to inject a fault into a function of the Loaded_Repository.
3. WHEN a Loaded_Repository is active, THE application SHALL allow the user to apply a patch and roll it back with a byte-identical result to the loaded source.
4. WHEN a Loaded_Repository is active, THE application SHALL show the inspector with source and diff for the loaded files.
5. WHEN a Loaded_Repository is active, THE application SHALL generate and download a bugfix spec from the loaded code.
6. THE application SHALL keep the loaded source in memory only and SHALL NOT write the loaded files to disk or to a server.

### Requirement 7: Empty and failure messages

**User Story:** As a user, I want clear messages when my code yields nothing to analyse, so that I know what to change.

#### Acceptance Criteria

1. IF a load produces zero loaded files, THEN THE Load_Dialog SHALL show a message stating that no supported source files were found and listing the supported extensions.
2. IF the loaded files contain no functions, THEN THE application SHALL show a message stating that no functions were found, and keep the previous repository active.
3. IF the loaded files contain functions but no call edges, THEN THE application SHALL render the graph and show a message stating that no calls between functions were found.
4. IF the loaded files contain no findings, THEN THE application SHALL show a message stating that no findings were detected rather than an empty panel.
5. IF a loaded file fails to parse, THEN THE application SHALL list that file as skipped with the Skip_Reason "parse error" and continue with the other files.

### Requirement 8: Repository URL parameter

**User Story:** As a user, I want to share a link that opens a specific repository, so that others can see my analysis with one click.

#### Acceptance Criteria

1. WHEN an application starts with a valid Repo_Param, THE application SHALL open the Load_Dialog on the GitHub tab with the value pre-filled and start the load.
2. WHEN a load started from the Repo_Param succeeds, THE application SHALL make the Loaded_Repository active.
3. IF the Repo_Param value is not of the form `owner/name`, THEN THE application SHALL keep the Sample_Repository active and show the format error from the GitHub_Helper.
4. WHEN the user loads a GitHub repository through the Load_Dialog, THE application SHALL update the Repo_Param in the address bar without reloading the page.
5. WHEN the user activates "Back to sample repository", THE application SHALL remove the Repo_Param from the address bar.
6. IF a load started from the Repo_Param fails, THEN THE application SHALL keep the Sample_Repository active and show the error in the Load_Dialog.

### Requirement 9: Test coverage

**User Story:** As a maintainer, I want property-based and example tests for the new code, so that limits and determinism are verified.

#### Acceptance Criteria

1. THE Core_Engine test suite SHALL include a fast-check property that the Code_Loader never returns more than 60 loaded files or more than 409,600 bytes of loaded content.
2. THE Core_Engine test suite SHALL include a fast-check property that the Code_Loader returns an identical Load_Result for any permutation of the same input.
3. THE Core_Engine test suite SHALL include a fast-check property that every input file appears exactly once in either the loaded list or the skipped list.
4. THE Core_Engine test suite SHALL include a fast-check property that every file skipped for "limit exceeded" sorts after every loaded file.
5. THE Core_Engine test suite SHALL include a fast-check property that a Candidate_File outside the eligible extensions or inside an ignored folder is never loaded.
5a. THE Core_Engine test suite SHALL include a fast-check property that a Test_File or a Candidate_File over 100 KB is never loaded, regardless of the Load_Limits.
6. THE Core_Engine test suite SHALL include a GitHub_Helper test with a mocked `fetch` covering success, HTTP 403, HTTP 429, HTTP 404, network failure, a partial file failure, and the absence of an Authorization header.
7. THE test suite of each application SHALL include a test that a loaded repository replaces the sample and that "Back to sample repository" restores it.
8. THE test suite of each application SHALL include a test of the Repo_Param behaviour in Requirement 8.
9. THE test suite SHALL include a round-trip test that applying and rolling back a patch on loaded code returns byte-identical source.

### Requirement 10: Quality gates

**User Story:** As a maintainer, I want the change to meet the repository's quality gates, so that it merges cleanly.

#### Acceptance Criteria

1. THE new and modified source files SHALL each contain fewer than 150 lines.
2. THE new and modified source files SHALL contain no use of the TypeScript type `any`.
3. WHEN `pnpm run lint:boundaries` runs, THE repository SHALL produce zero violations.
4. WHEN the typecheck runs, THE repository SHALL produce zero errors.
5. WHEN the test suites run, THE repository SHALL report zero failing tests.
6. THE Core_Engine SHALL contain no Application vocabulary in identifiers or comments of the new modules, and only the Adapter files SHALL import `packages/morpheus-ast-core/src/index`.
