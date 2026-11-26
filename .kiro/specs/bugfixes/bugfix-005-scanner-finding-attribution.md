# Bugfix Spec 005: Scanner Findings Were Misattributed or Crashed the Mapper

**Spec ID**: `bugfix-005`
**File**: `packages/morpheus-ast-core/src/security/ingestion.ts`
**Functions**: `SecurityIngestionAdapter.ingestSonarQube / ingestSnyk / ingestAwsSecurity / ingestAikido`, `findFunctionAtRange`
**Discovered by**: `tests/pbt/security-ingestion.test.ts`, run once with type-checking disabled against the previous mapper: **6 of 10 tests failed** (I2, I4, I5, I6, I8, I9)
**Methodology**: Property-Aware Code Evolution (C ⟹ P)

---

## Current Behavior (Defect)

Findings from external scanners decide which function a monster or risk entry is attached to, so wrong
attribution shows up directly in both apps. External reports are also untrusted JSON.

**Observed failures** (previous mapper):

| Test | Input | Result |
|---|---|---|
| I2 | SonarQube component `my-project:src/api/handler.ts`, line inside `inner()` | `functionId` was `null`; paths were compared exactly, and SonarQube prefixes the project key |
| I4 | Snyk, Aikido, AWS and SonarQube findings that name a file but no line | attached to `query`, the function that starts on line 1; the mapper invented line 1 for "unknown" |
| I5 | Snyk `cvssScore: 99` | passed through; the valid range is 0 to 10 |
| I6 | AWS finding with no `Severity` object | `TypeError: Cannot read properties of undefined (reading 'Label')` |
| I8 | `null` entry in a report | `TypeError: Cannot read properties of null (reading 'severity')` |
| I9 | property test with arbitrary JSON items, shrunk to `[""]` | `TypeError ... reading 'toUpperCase'` |

The old lookup also returned the first function whose line range contained the finding, so a finding inside a
nested function was attached to the outer one.

Violated properties: **a finding is attached to a function only when the report gives a line inside it**, and
**the mapper never throws on input it did not produce**.

---

## Expected Behavior (Correct)

- Every field is read defensively (`asBag`, `asString`, `asFiniteNumber`); malformed entries produce a finding
  with safe defaults, and non-array reports are treated as empty.
- Findings without line information use line 0 ("unknown") and always get `functionId: null`.
- Paths are normalised (separators, leading `./`, SonarQube `projectKey:` prefix) before comparing; a Windows
  drive letter is not mistaken for a project key.
- The innermost function containing the line wins.
- CVSS scores outside 0 to 10, or not finite, become `null`.
- Severities are always one of `CRITICAL | HIGH | MEDIUM | LOW | INFO`; the scanner report types now live in
  `contracts.ts` (`SonarQubeIssue`, `SnykVulnerability`, `AwsSecurityFinding`, `AikidoFinding`,
  `ExternalScanReport`) and are available through `engine.ingestExternalFindings`.

After the fix all 10 mapper tests pass, plus the engine-level tests F5 to F7 (ordering and unique ids).

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

- Severity and category mappings for well-formed input are unchanged (I1, I7, I10).
- A line outside every function, or in another file, still gives `functionId: null` (I3).
- Internal analysis (`runSecurityScan`) still reports uncaught-exception paths, unused variables, circular
  calls and complexity of at least 15 (REQ-CE-027, `sample-repo.test.ts`).
- Finding ids stay unique across calls and across internal and external findings (I9, F7).
- The mapper still never touches source files.

| Property | Invariant |
|---|---|
| I2 | `projectKey:path` matches, innermost function wins |
| I4 | no line information, no function |
| I8, I9 | no input makes the mapper throw; results are well-formed |
| I10 | arbitrary severity labels map to a valid severity |
