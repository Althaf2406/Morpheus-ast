/**
 * tests/pbt/security-ingestion.test.ts
 *
 * Normalisation of SonarQube, Snyk, AWS Security Hub and Aikido reports.
 * Reports are untrusted JSON, so the mapper must never throw on bad input, must only
 * produce valid severities, and must attach a finding to a function only when the report
 * gives a line inside that function.
 */

import * as fc from "fast-check";
import { SecurityIngestionAdapter } from "../../src/security/ingestion.js";
import type {
  AikidoFinding,
  AwsSecurityFinding,
  FindingSeverity,
  FunctionNode,
  SnykVulnerability,
  SonarQubeIssue,
  TopologyGraph,
} from "../../src/contracts.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");
const SEVERITIES: readonly FindingSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: src/api/handler.ts has outer() at lines 1-20 containing inner() at lines 5-10;
// src/db.ts has query() at lines 1-5.
// ─────────────────────────────────────────────────────────────────────────────

const fn = (name: string, filePath: string, startLine: number, endLine: number): FunctionNode => ({
  id: `fn:${filePath}:${name}`,
  name,
  filePath,
  range: { filePath, startLine, startColumn: 0, endLine, endColumn: 1, startIndex: 0, endIndex: 0 },
  cyclomaticComplexity: 1,
  hasCircularDep: false,
  unusedVariables: [],
  hasUncaughtException: false,
  parameterCount: 0,
});

const outer = fn("outer", "src/api/handler.ts", 1, 20);
const inner = fn("inner", "src/api/handler.ts", 5, 10);
const query = fn("query", "src/db.ts", 1, 5);

const graph: TopologyGraph = {
  modules: [],
  functions: [outer, inner, query],
  edges: [],
  totalComplexity: 3,
  circularDepCount: 0,
  durationMs: 0,
};

const sonar = (over: Partial<SonarQubeIssue> = {}): SonarQubeIssue => ({
  key: "k1",
  severity: "MAJOR",
  type: "CODE_SMELL",
  message: "something",
  component: "src/api/handler.ts",
  rule: "typescript:S100",
  ...over,
});

describe("security ingestion", () => {
  // ── SonarQube ──────────────────────────────────────────────────────────────
  it("I1: SonarQube severities and categories map as documented", () => {
    const a = new SecurityIngestionAdapter();
    const run = (over: Partial<SonarQubeIssue>) => a.ingestSonarQube([sonar(over)], graph)[0]!;

    expect(run({ severity: "BLOCKER" }).severity).toBe("CRITICAL");
    expect(run({ severity: "CRITICAL" }).severity).toBe("CRITICAL");
    expect(run({ severity: "MAJOR" }).severity).toBe("HIGH");
    expect(run({ severity: "MINOR" }).severity).toBe("MEDIUM");
    expect(run({ severity: "INFO" }).severity).toBe("INFO");
    expect(run({ severity: "whatever" }).severity).toBe("LOW");

    expect(run({ type: "VULNERABILITY" }).category).toBe("VULNERABILITY");
    expect(run({ rule: "typescript:S2068" }).category).toBe("SECRET_LEAK");
    expect(run({}).category).toBe("CODE_SMELL");
    expect(run({}).sourceScanner).toBe("SONARQUBE");
  });

  it("I2: a 'projectKey:path' component matches the function's file, and the innermost function wins", () => {
    const a = new SecurityIngestionAdapter();
    const [finding] = a.ingestSonarQube(
      [sonar({ component: "my-project:src/api/handler.ts", textRange: { startLine: 6, endLine: 7, startOffset: 0, endOffset: 4 } })],
      graph
    );
    expect(finding!.functionId).toBe(inner.id);

    const [outside] = a.ingestSonarQube(
      [sonar({ component: "my-project:src/api/handler.ts", textRange: { startLine: 15, endLine: 15, startOffset: 0, endOffset: 4 } })],
      graph
    );
    expect(outside!.functionId).toBe(outer.id);
  });

  it("I3: a line outside every function, or a different file, gives functionId null", () => {
    const a = new SecurityIngestionAdapter();
    const [pastEnd] = a.ingestSonarQube(
      [sonar({ textRange: { startLine: 99, endLine: 99, startOffset: 0, endOffset: 1 } })],
      graph
    );
    expect(pastEnd!.functionId).toBeNull();

    const [otherFile] = a.ingestSonarQube(
      [sonar({ component: "src/other.ts", textRange: { startLine: 2, endLine: 2, startOffset: 0, endOffset: 1 } })],
      graph
    );
    expect(otherFile!.functionId).toBeNull();
  });

  it("I4: findings with no line information are never attached to a function", () => {
    const a = new SecurityIngestionAdapter();
    const noRange = a.ingestSonarQube([sonar({ component: "src/db.ts" })], graph)[0]!;
    const snyk = a.ingestSnyk(
      [{ id: "s", severity: "high", title: "t", description: "d", packageName: "p", filePath: "src/db.ts" }],
      graph
    )[0]!;
    const aikido = a.ingestAikido(
      [{ id: "a", severity_level: 2, name: "n", description: "d", affected_file: "src/db.ts" }],
      graph
    )[0]!;
    const aws = a.ingestAwsSecurity(
      [{ Id: "i", Severity: { Label: "HIGH" }, Title: "t", Description: "d", Resources: [{ Id: "src/db.ts", Type: "File" }], Types: [] }],
      graph
    )[0]!;
    for (const finding of [noRange, snyk, aikido, aws]) expect(finding.functionId).toBeNull();
  });

  // ── Snyk ───────────────────────────────────────────────────────────────────
  it("I5: Snyk severities, category, CWE and CVSS handling", () => {
    const a = new SecurityIngestionAdapter();
    const make = (over: Partial<SnykVulnerability>): SnykVulnerability => ({
      id: "s", severity: "high", title: "t", description: "d", packageName: "lodash", ...over,
    });
    const run = (over: Partial<SnykVulnerability>) => a.ingestSnyk([make(over)], graph)[0]!;

    expect(run({ severity: "critical" }).severity).toBe("CRITICAL");
    expect(run({ severity: "HIGH" }).severity).toBe("HIGH");
    expect(run({ severity: "medium" }).severity).toBe("MEDIUM");
    expect(run({ severity: "low" }).severity).toBe("LOW");
    expect(run({ severity: "???" }).severity).toBe("INFO");
    expect(run({}).category).toBe("DEPENDENCY_RISK");
    expect(run({ cwe: ["CWE-79", "CWE-80"] }).cweId).toBe("CWE-79");
    expect(run({ cvssScore: 7.5 }).cvssScore).toBe(7.5);
    expect(run({ cvssScore: 99 }).cvssScore).toBeNull();
    expect(run({ cvssScore: -1 }).cvssScore).toBeNull();
    expect(run({}).sourceScanner).toBe("SNYK");
  });

  // ── AWS ────────────────────────────────────────────────────────────────────
  it("I6: AWS findings map severity and category, and tolerate missing parts", () => {
    const a = new SecurityIngestionAdapter();
    const make = (over: Partial<AwsSecurityFinding>): AwsSecurityFinding => ({
      Id: "i", Severity: { Label: "HIGH" }, Title: "t", Description: "d",
      Resources: [{ Id: "src/db.ts", Type: "File" }], Types: [], ...over,
    });
    const run = (over: Partial<AwsSecurityFinding>) => a.ingestAwsSecurity([make(over)], graph)[0]!;

    expect(run({ Severity: { Label: "CRITICAL" } }).severity).toBe("CRITICAL");
    expect(run({ Severity: { Label: "INFORMATIONAL" } }).severity).toBe("INFO");
    expect(run({ Types: ["Software and Configuration Checks/Auth"] }).category).toBe("AUTH_BYPASS");
    expect(run({ Types: ["Injection"] }).category).toBe("INJECTION");
    expect(run({}).sourceScanner).toBe("AWS_SECURITY_ANALYZER");

    expect(() => run({ Resources: [] })).not.toThrow();
    expect(run({ Resources: [] }).filePath).toBe("unknown");
    // Untrusted JSON can omit whole objects.
    expect(() => run({ Severity: undefined as unknown as AwsSecurityFinding["Severity"] })).not.toThrow();
    expect(() => run({ Resources: undefined as unknown as AwsSecurityFinding["Resources"] })).not.toThrow();
    expect(() => run({ Types: undefined as unknown as AwsSecurityFinding["Types"] })).not.toThrow();
  });

  // ── Aikido ─────────────────────────────────────────────────────────────────
  it("I7: Aikido levels and categories", () => {
    const a = new SecurityIngestionAdapter();
    const make = (over: Partial<AikidoFinding>): AikidoFinding => ({
      id: "a", severity_level: 1, name: "n", description: "d", ...over,
    });
    const run = (over: Partial<AikidoFinding>) => a.ingestAikido([make(over)], graph)[0]!;

    expect(run({ severity_level: 1 }).severity).toBe("CRITICAL");
    expect(run({ severity_level: 2 }).severity).toBe("HIGH");
    expect(run({ severity_level: 3 }).severity).toBe("MEDIUM");
    expect(run({ severity_level: 4 }).severity).toBe("LOW");
    expect(run({ severity_level: 99 }).severity).toBe("LOW");
    expect(run({ name: "SQL injection in query" }).category).toBe("INJECTION");
    expect(run({ name: "Prototype pollution" }).category).toBe("PROTOTYPE_POLLUTION");
    expect(run({ name: "Hardcoded secret" }).category).toBe("SECRET_LEAK");
    expect(run({ cwe_ids: ["CWE-89"] }).cweId).toBe("CWE-89");
    expect(run({}).sourceScanner).toBe("AIKIDO");
  });

  // ── Robustness ─────────────────────────────────────────────────────────────
  it("I8: malformed entries and non-array reports never throw", () => {
    const a = new SecurityIngestionAdapter();
    const junk = [null, undefined, 7, "text", [], {}, { severity: 5 }, { Severity: null }] as unknown[];

    expect(() => a.ingestSonarQube(junk as unknown as SonarQubeIssue[], graph)).not.toThrow();
    expect(() => a.ingestSnyk(junk as unknown as SnykVulnerability[], graph)).not.toThrow();
    expect(() => a.ingestAwsSecurity(junk as unknown as AwsSecurityFinding[], graph)).not.toThrow();
    expect(() => a.ingestAikido(junk as unknown as AikidoFinding[], graph)).not.toThrow();
    expect(() => a.ingestSonarQube(null as unknown as SonarQubeIssue[], graph)).not.toThrow();
    expect(() => a.ingestSnyk("nope" as unknown as SnykVulnerability[], graph)).not.toThrow();
  });

  it("I9: for arbitrary JSON input every result is well-formed and ids are unique", () => {
    const a = new SecurityIngestionAdapter();
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 8 }), (items) => {
        const results = [
          ...a.ingestSonarQube(items as unknown as SonarQubeIssue[], graph),
          ...a.ingestSnyk(items as unknown as SnykVulnerability[], graph),
          ...a.ingestAwsSecurity(items as unknown as AwsSecurityFinding[], graph),
          ...a.ingestAikido(items as unknown as AikidoFinding[], graph),
        ];
        for (const r of results) {
          expect(SEVERITIES).toContain(r.severity);
          expect(typeof r.title).toBe("string");
          expect(typeof r.description).toBe("string");
          expect(typeof r.filePath).toBe("string");
          if (r.cvssScore !== null) {
            expect(r.cvssScore).toBeGreaterThanOrEqual(0);
            expect(r.cvssScore).toBeLessThanOrEqual(10);
          }
          if (r.functionId !== null) expect(graph.functions.some((f) => f.id === r.functionId)).toBe(true);
        }
        const ids = results.map((r) => r.findingId);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: RUNS }
    );
  });

  it("I10: arbitrary severity strings always map to a valid severity", () => {
    const a = new SecurityIngestionAdapter();
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.integer({ min: -5, max: 9 }), (label, level) => {
        const s1 = a.ingestSonarQube([sonar({ severity: label })], graph)[0]!.severity;
        const s2 = a.ingestSnyk([{ id: "s", severity: label, title: "t", description: "d", packageName: "p" }], graph)[0]!.severity;
        const s3 = a.ingestAwsSecurity(
          [{ Id: "i", Severity: { Label: label }, Title: "t", Description: "d", Resources: [], Types: [] }],
          graph
        )[0]!.severity;
        const s4 = a.ingestAikido([{ id: "a", severity_level: level, name: "n", description: "d" }], graph)[0]!.severity;
        for (const s of [s1, s2, s3, s4]) expect(SEVERITIES).toContain(s);
      }),
      { numRuns: RUNS }
    );
  });
});
