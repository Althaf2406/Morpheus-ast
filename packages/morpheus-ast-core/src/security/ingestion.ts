/**
 * security/ingestion.ts
 *
 * Maps raw findings from SonarQube, Snyk, Aikido, and AWS Security Analyzer
 * into the unified SecurityScanResult[] contract.
 *
 * Also performs lightweight internal static analysis (unused variables,
 * uncaught exceptions, prototype-pollution sinks) on the parsed file set.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary
 *   - Zero `any` types
 *   - Prototype-pollution safe throughout
 */

import type {
  SecurityScanResult,
  FindingSeverity,
  FindingCategory,
  ParsedFile,
  TopologyGraph,
  SourceRange,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Raw finding shapes from external tools (narrow typed, no `any`)
// ─────────────────────────────────────────────────────────────────────────────

/** SonarQube REST API issue shape (subset we care about). */
export interface SonarQubeIssue {
  key: string;
  severity: string;        // "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO"
  type: string;            // "BUG" | "VULNERABILITY" | "CODE_SMELL"
  message: string;
  component: string;       // file path
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  rule: string;            // e.g. "typescript:S2068"
}

/** Snyk vulnerability result shape (subset). */
export interface SnykVulnerability {
  id: string;
  severity: string;        // "critical" | "high" | "medium" | "low"
  title: string;
  description: string;
  packageName: string;
  filePath?: string;
  cvssScore?: number;
  cwe?: string[];
}

/** AWS Security Hub finding shape (subset). */
export interface AwsSecurityFinding {
  Id: string;
  Severity: { Label: string };  // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFORMATIONAL"
  Title: string;
  Description: string;
  Resources: Array<{ Id: string; Type: string }>;
  Types: string[];
}

/** Aikido finding shape (subset). */
export interface AikidoFinding {
  id: string;
  severity_level: number;   // 1 (critical) → 4 (low)
  name: string;
  description: string;
  affected_file?: string;
  cwe_ids?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// SecurityIngestionAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class SecurityIngestionAdapter {
  private findingCounter = 0;

  // ─── SonarQube ────────────────────────────────────────────────────────────

  ingestSonarQube(
    issues: readonly SonarQubeIssue[],
    graph: TopologyGraph
  ): SecurityScanResult[] {
    return issues.map((issue) => {
      const severity = this.mapSonarSeverity(issue.severity);
      const category = this.mapSonarType(issue.type, issue.rule);
      const range = this.sonarRangeToSourceRange(issue);
      const functionId = this.findFunctionAtRange(range, graph);

      return this.makeResult({
        severity,
        category,
        title: `[${issue.rule}] ${issue.message}`,
        description: issue.message,
        filePath: issue.component,
        range,
        functionId,
        sourceScanner: "SONARQUBE",
        cweId: null,
        cvssScore: null,
      });
    });
  }

  // ─── Snyk ─────────────────────────────────────────────────────────────────

  ingestSnyk(
    vulns: readonly SnykVulnerability[],
    graph: TopologyGraph
  ): SecurityScanResult[] {
    return vulns.map((v) => {
      const severity = this.mapSnykSeverity(v.severity);
      const range = this.defaultRange(v.filePath ?? "unknown");
      const functionId = this.findFunctionAtRange(range, graph);
      const cweId = v.cwe != null && v.cwe.length > 0 ? v.cwe[0] ?? null : null;

      return this.makeResult({
        severity,
        category: "DEPENDENCY_RISK",
        title: `${v.title} (${v.packageName})`,
        description: v.description,
        filePath: v.filePath ?? "unknown",
        range,
        functionId,
        sourceScanner: "SNYK",
        cweId,
        cvssScore: v.cvssScore ?? null,
      });
    });
  }

  // ─── AWS Security Analyzer ────────────────────────────────────────────────

  ingestAwsSecurity(
    findings: readonly AwsSecurityFinding[],
    graph: TopologyGraph
  ): SecurityScanResult[] {
    return findings.map((f) => {
      const severity = this.mapAwsSeverity(f.Severity.Label);
      const filePath = f.Resources[0]?.Id ?? "unknown";
      const range = this.defaultRange(filePath);
      const functionId = this.findFunctionAtRange(range, graph);
      const category = this.mapAwsType(f.Types);

      return this.makeResult({
        severity,
        category,
        title: f.Title,
        description: f.Description,
        filePath,
        range,
        functionId,
        sourceScanner: "AWS_SECURITY_ANALYZER",
        cweId: null,
        cvssScore: null,
      });
    });
  }

  // ─── Aikido ───────────────────────────────────────────────────────────────

  ingestAikido(
    findings: readonly AikidoFinding[],
    graph: TopologyGraph
  ): SecurityScanResult[] {
    return findings.map((f) => {
      const severity = this.mapAikidoSeverity(f.severity_level);
      const filePath = f.affected_file ?? "unknown";
      const range = this.defaultRange(filePath);
      const functionId = this.findFunctionAtRange(range, graph);
      const cweId = f.cwe_ids != null && f.cwe_ids.length > 0 ? f.cwe_ids[0] ?? null : null;

      return this.makeResult({
        severity,
        category: this.mapAikidoCategory(f.name),
        title: f.name,
        description: f.description,
        filePath,
        range,
        functionId,
        sourceScanner: "AIKIDO",
        cweId,
        cvssScore: null,
      });
    });
  }

  // ─── Internal static analysis ─────────────────────────────────────────────

  /**
   * Runs lightweight internal analysis on the topology graph to surface
   * unused variables, uncaught exceptions, and circular dependencies
   * as SecurityScanResult entries.
   */
  runInternalAnalysis(
    _parsedFiles: readonly ParsedFile[],
    graph: TopologyGraph
  ): SecurityScanResult[] {
    const results: SecurityScanResult[] = [];

    for (const fn of graph.functions) {
      // Unused variables
      for (const varName of fn.unusedVariables) {
        results.push(
          this.makeResult({
            severity: "LOW",
            category: "UNUSED_VARIABLE",
            title: `Unused variable: ${varName}`,
            description: `Variable "${varName}" is declared but never used in function "${fn.name}". Consider removing it to reduce confusion.`,
            filePath: fn.filePath,
            range: fn.range,
            functionId: fn.id,
            sourceScanner: "INTERNAL",
            cweId: null,
            cvssScore: null,
          })
        );
      }

      // Uncaught exceptions
      if (fn.hasUncaughtException) {
        results.push(
          this.makeResult({
            severity: "HIGH",
            category: "UNCAUGHT_EXCEPTION",
            title: `Uncaught exception path in: ${fn.name}`,
            description: `Function "${fn.name}" contains a code path that can throw without a surrounding try/catch or error boundary. Cyclomatic complexity: ${fn.cyclomaticComplexity}.`,
            filePath: fn.filePath,
            range: fn.range,
            functionId: fn.id,
            sourceScanner: "INTERNAL",
            cweId: "CWE-390",
            cvssScore: null,
          })
        );
      }

      // Circular dependency
      if (fn.hasCircularDep) {
        results.push(
          this.makeResult({
            severity: "MEDIUM",
            category: "CODE_SMELL",
            title: `Circular dependency in module: ${fn.name}`,
            description: `Function "${fn.name}" participates in a circular dependency chain. This can cause initialization-order bugs and memory leaks.`,
            filePath: fn.filePath,
            range: fn.range,
            functionId: fn.id,
            sourceScanner: "INTERNAL",
            cweId: "CWE-1120",
            cvssScore: null,
          })
        );
      }

      // High complexity — potential injection risk
      if (fn.cyclomaticComplexity >= 15) {
        results.push(
          this.makeResult({
            severity: "MEDIUM",
            category: "VULNERABILITY",
            title: `High complexity function: ${fn.name} (CC=${fn.cyclomaticComplexity})`,
            description: `Cyclomatic Complexity of ${fn.cyclomaticComplexity} exceeds the threshold of 15. High-complexity functions are harder to audit for security vulnerabilities and are likely to contain untested edge cases.`,
            filePath: fn.filePath,
            range: fn.range,
            functionId: fn.id,
            sourceScanner: "INTERNAL",
            cweId: "CWE-1121",
            cvssScore: null,
          })
        );
      }
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private makeResult(params: {
    severity: FindingSeverity;
    category: FindingCategory;
    title: string;
    description: string;
    filePath: string;
    range: SourceRange;
    functionId: string | null;
    sourceScanner: SecurityScanResult["sourceScanner"];
    cweId: string | null;
    cvssScore: number | null;
  }): SecurityScanResult {
    this.findingCounter += 1;
    return {
      findingId: `finding-${this.findingCounter.toString().padStart(6, "0")}`,
      ...params,
    };
  }

  private findFunctionAtRange(
    range: SourceRange,
    graph: TopologyGraph
  ): string | null {
    // Find the function whose range contains the finding's start position
    for (const fn of graph.functions) {
      if (
        fn.filePath === range.filePath &&
        fn.range.startLine <= range.startLine &&
        fn.range.endLine >= range.endLine
      ) {
        return fn.id;
      }
    }
    return null;
  }

  private defaultRange(filePath: string): SourceRange {
    return {
      filePath,
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 0,
      startIndex: 0,
      endIndex: 0,
    };
  }

  private sonarRangeToSourceRange(issue: SonarQubeIssue): SourceRange {
    if (issue.textRange == null) return this.defaultRange(issue.component);
    return {
      filePath: issue.component,
      startLine: issue.textRange.startLine,
      startColumn: issue.textRange.startOffset,
      endLine: issue.textRange.endLine,
      endColumn: issue.textRange.endOffset,
      startIndex: 0,
      endIndex: 0,
    };
  }

  // ─── Severity mappers ─────────────────────────────────────────────────────

  private mapSonarSeverity(s: string): FindingSeverity {
    const upper = s.toUpperCase();
    if (upper === "BLOCKER" || upper === "CRITICAL") return "CRITICAL";
    if (upper === "MAJOR") return "HIGH";
    if (upper === "MINOR") return "MEDIUM";
    if (upper === "INFO") return "INFO";
    return "LOW";
  }

  private mapSnykSeverity(s: string): FindingSeverity {
    const lower = s.toLowerCase();
    if (lower === "critical") return "CRITICAL";
    if (lower === "high") return "HIGH";
    if (lower === "medium") return "MEDIUM";
    if (lower === "low") return "LOW";
    return "INFO";
  }

  private mapAwsSeverity(label: string): FindingSeverity {
    const upper = label.toUpperCase();
    if (upper === "CRITICAL") return "CRITICAL";
    if (upper === "HIGH") return "HIGH";
    if (upper === "MEDIUM") return "MEDIUM";
    if (upper === "LOW") return "LOW";
    return "INFO";
  }

  private mapAikidoSeverity(level: number): FindingSeverity {
    if (level === 1) return "CRITICAL";
    if (level === 2) return "HIGH";
    if (level === 3) return "MEDIUM";
    return "LOW";
  }

  // ─── Category mappers ─────────────────────────────────────────────────────

  private mapSonarType(type: string, rule: string): FindingCategory {
    if (type === "VULNERABILITY") return "VULNERABILITY";
    if (rule.includes("S2068") || rule.includes("secret") || rule.includes("password")) {
      return "SECRET_LEAK";
    }
    return "CODE_SMELL";
  }

  private mapAwsType(types: string[]): FindingCategory {
    const joined = types.join(",").toLowerCase();
    if (joined.includes("auth")) return "AUTH_BYPASS";
    if (joined.includes("inject")) return "INJECTION";
    if (joined.includes("secret") || joined.includes("credential")) return "SECRET_LEAK";
    return "VULNERABILITY";
  }

  private mapAikidoCategory(name: string): FindingCategory {
    const lower = name.toLowerCase();
    if (lower.includes("injection") || lower.includes("sql") || lower.includes("xss")) {
      return "INJECTION";
    }
    if (lower.includes("auth") || lower.includes("bypass")) return "AUTH_BYPASS";
    if (lower.includes("secret") || lower.includes("credential")) return "SECRET_LEAK";
    if (lower.includes("prototype") || lower.includes("pollution")) return "PROTOTYPE_POLLUTION";
    return "VULNERABILITY";
  }
}
