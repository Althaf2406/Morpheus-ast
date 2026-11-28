/**
 * security/ingestion.ts
 *
 * Normalises findings from SonarQube, Snyk, AWS Security Hub and Aikido into
 * SecurityScanResult, and runs the engine's own lightweight analysis.
 *
 * External reports are untrusted JSON: every field is read defensively, a malformed
 * entry yields a finding with safe defaults instead of throwing, and severities are
 * always one of the five FindingSeverity values.
 *
 * A finding is attached to a function (`functionId`) only when the report gives a line
 * inside that function (innermost function wins). Whole-file findings have `functionId: null`.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary
 *   - Zero `any` types
 */

import type {
  AikidoFinding,
  AwsSecurityFinding,
  FindingCategory,
  FindingSeverity,
  ParsedFile,
  SecurityScanResult,
  SnykVulnerability,
  SonarQubeIssue,
  SourceRange,
  TopologyGraph,
} from "../contracts.js";

export type { AikidoFinding, AwsSecurityFinding, SnykVulnerability, SonarQubeIssue } from "../contracts.js";

type Scanner = SecurityScanResult["sourceScanner"];

interface Draft {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string;
  filePath: string;
  range: SourceRange;
  sourceScanner: Scanner;
  cweId: string | null;
  cvssScore: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defensive readers for untrusted JSON
// ─────────────────────────────────────────────────────────────────────────────

type Bag = Record<string, unknown>;

const asBag = (v: unknown): Bag => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Bag) : {});
const asString = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asFiniteNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const firstString = (v: unknown): string | null => {
  const first = asArray(v)[0];
  return typeof first === "string" && first.length > 0 ? first : null;
};

/** Range for findings that have no line information: line 0 means "unknown". */
const unknownLocation = (filePath: string): SourceRange => ({
  filePath,
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
  startIndex: 0,
  endIndex: 0,
});

// ─────────────────────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lower-cases nothing and keeps the repo-relative part: unifies separators, drops a leading
 * "./" or "/", and drops a SonarQube "projectKey:" prefix (a single letter before the colon
 * is a Windows drive, not a project key).
 */
function normalizePath(raw: string): string {
  let p = raw.split("\\").join("/");
  const colon = p.lastIndexOf(":");
  if (colon > 1) p = p.slice(colon + 1);
  while (p.startsWith("./")) p = p.slice(2);
  while (p.startsWith("/")) p = p.slice(1);
  return p;
}

function samePath(a: string, b: string): boolean {
  const x = normalizePath(a);
  const y = normalizePath(b);
  if (x.length === 0 || y.length === 0) return false;
  return x === y || x.endsWith(`/${y}`) || y.endsWith(`/${x}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity and category mapping
// ─────────────────────────────────────────────────────────────────────────────

function sonarSeverity(raw: unknown): FindingSeverity {
  switch (asString(raw).toUpperCase()) {
    case "BLOCKER":
    case "CRITICAL": return "CRITICAL";
    case "MAJOR": return "HIGH";
    case "MINOR": return "MEDIUM";
    case "INFO": return "INFO";
    default: return "LOW";
  }
}

function snykSeverity(raw: unknown): FindingSeverity {
  switch (asString(raw).toLowerCase()) {
    case "critical": return "CRITICAL";
    case "high": return "HIGH";
    case "medium": return "MEDIUM";
    case "low": return "LOW";
    default: return "INFO";
  }
}

function awsSeverity(raw: unknown): FindingSeverity {
  switch (asString(raw).toUpperCase()) {
    case "CRITICAL": return "CRITICAL";
    case "HIGH": return "HIGH";
    case "MEDIUM": return "MEDIUM";
    case "LOW": return "LOW";
    default: return "INFO";
  }
}

function aikidoSeverity(raw: unknown): FindingSeverity {
  switch (raw) {
    case 1: return "CRITICAL";
    case 2: return "HIGH";
    case 3: return "MEDIUM";
    default: return "LOW";
  }
}

function sonarCategory(type: string, rule: string): FindingCategory {
  if (type === "VULNERABILITY") return "VULNERABILITY";
  const r = rule.toLowerCase();
  if (r.includes("s2068") || r.includes("secret") || r.includes("password")) return "SECRET_LEAK";
  return "CODE_SMELL";
}

function awsCategory(types: readonly unknown[]): FindingCategory {
  const joined = types.filter((t): t is string => typeof t === "string").join(",").toLowerCase();
  if (joined.includes("auth")) return "AUTH_BYPASS";
  if (joined.includes("inject")) return "INJECTION";
  if (joined.includes("secret") || joined.includes("credential")) return "SECRET_LEAK";
  return "VULNERABILITY";
}

function aikidoCategory(name: string): FindingCategory {
  const n = name.toLowerCase();
  if (n.includes("injection") || n.includes("sql") || n.includes("xss")) return "INJECTION";
  if (n.includes("auth") || n.includes("bypass")) return "AUTH_BYPASS";
  if (n.includes("secret") || n.includes("credential")) return "SECRET_LEAK";
  if (n.includes("prototype") || n.includes("pollution")) return "PROTOTYPE_POLLUTION";
  return "VULNERABILITY";
}

// ─────────────────────────────────────────────────────────────────────────────
// SecurityIngestionAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class SecurityIngestionAdapter {

  ingestSonarQube(issues: readonly SonarQubeIssue[], graph: TopologyGraph): SecurityScanResult[] {
    const ids = new IdAllocator();
    return asArray(issues).map((raw) => {
      const issue = asBag(raw);
      const component = asString(issue["component"], "unknown");
      const rule = asString(issue["rule"]);
      const message = asString(issue["message"]);
      const textRange = asBag(issue["textRange"]);
      const startLine = asFiniteNumber(textRange["startLine"]);
      const endLine = asFiniteNumber(textRange["endLine"]);

      const range: SourceRange =
        startLine !== null && startLine >= 1
          ? {
              filePath: component,
              startLine,
              startColumn: asFiniteNumber(textRange["startOffset"]) ?? 0,
              endLine: endLine !== null && endLine >= startLine ? endLine : startLine,
              endColumn: asFiniteNumber(textRange["endOffset"]) ?? 0,
              startIndex: 0,
              endIndex: 0,
            }
          : unknownLocation(component);

      return this.finish(graph, ids, {
        severity: sonarSeverity(issue["severity"]),
        category: sonarCategory(asString(issue["type"]), rule),
        title: rule.length > 0 ? `[${rule}] ${message}` : message,
        description: message,
        filePath: component,
        range,
        sourceScanner: "SONARQUBE",
        cweId: null,
        cvssScore: null,
      });
    });
  }

  ingestSnyk(vulns: readonly SnykVulnerability[], graph: TopologyGraph): SecurityScanResult[] {
    const ids = new IdAllocator();
    return asArray(vulns).map((raw) => {
      const v = asBag(raw);
      const filePath = asString(v["filePath"], "unknown");
      const cvss = asFiniteNumber(v["cvssScore"]);
      const packageName = asString(v["packageName"]);
      const title = asString(v["title"]);

      return this.finish(graph, ids, {
        severity: snykSeverity(v["severity"]),
        category: "DEPENDENCY_RISK",
        title: packageName.length > 0 ? `${title} (${packageName})` : title,
        description: asString(v["description"]),
        filePath,
        range: unknownLocation(filePath),
        sourceScanner: "SNYK",
        cweId: firstString(v["cwe"]),
        cvssScore: cvss !== null && cvss >= 0 && cvss <= 10 ? cvss : null,
      });
    });
  }

  ingestAwsSecurity(findings: readonly AwsSecurityFinding[], graph: TopologyGraph): SecurityScanResult[] {
    const ids = new IdAllocator();
    return asArray(findings).map((raw) => {
      const f = asBag(raw);
      const firstResource = asBag(asArray(f["Resources"])[0]);
      const filePath = asString(firstResource["Id"], "unknown");

      return this.finish(graph, ids, {
        severity: awsSeverity(asBag(f["Severity"])["Label"]),
        category: awsCategory(asArray(f["Types"])),
        title: asString(f["Title"]),
        description: asString(f["Description"]),
        filePath,
        range: unknownLocation(filePath),
        sourceScanner: "AWS_SECURITY_ANALYZER",
        cweId: null,
        cvssScore: null,
      });
    });
  }

  ingestAikido(findings: readonly AikidoFinding[], graph: TopologyGraph): SecurityScanResult[] {
    const ids = new IdAllocator();
    return asArray(findings).map((raw) => {
      const f = asBag(raw);
      const filePath = asString(f["affected_file"], "unknown");
      const name = asString(f["name"]);

      return this.finish(graph, ids, {
        severity: aikidoSeverity(f["severity_level"]),
        category: aikidoCategory(name),
        title: name,
        description: asString(f["description"]),
        filePath,
        range: unknownLocation(filePath),
        sourceScanner: "AIKIDO",
        cweId: firstString(f["cwe_ids"]),
        cvssScore: null,
      });
    });
  }

  /**
   * The engine's own analysis of the topology: unused variables, uncaught exception paths,
   * circular calls and functions with complexity of at least 15.
   */
  runInternalAnalysis(_parsedFiles: readonly ParsedFile[], graph: TopologyGraph): SecurityScanResult[] {
    const results: SecurityScanResult[] = [];
    const ids = new IdAllocator();
    const add = (
      fnIndex: number,
      discriminator: string,
      draft: Omit<Draft, "filePath" | "range" | "sourceScanner" | "cweId" | "cvssScore"> & { cweId?: string }
    ): void => {
      const fn = graph.functions[fnIndex]!;
      results.push(
        make(
          ids,
          { ...draft, filePath: fn.filePath, range: fn.range, sourceScanner: "INTERNAL", cweId: draft.cweId ?? null, cvssScore: null },
          fn.id,
          discriminator
        )
      );
    };

    graph.functions.forEach((fn, i) => {
      for (const name of fn.unusedVariables) {
        add(i, name, {
          severity: "LOW",
          category: "UNUSED_VARIABLE",
          title: `Unused variable: ${name}`,
          description: `Variable "${name}" is declared but never used in function "${fn.name}".`,
        });
      }
      if (fn.hasUncaughtException) {
        add(i, "uncaught-exception", {
          severity: "HIGH",
          category: "UNCAUGHT_EXCEPTION",
          title: `Uncaught exception path in: ${fn.name}`,
          description: `Function "${fn.name}" can throw without a surrounding try/catch${describeReasons(fn.uncaughtReasons)}. Cyclomatic complexity: ${fn.cyclomaticComplexity}.`,
          cweId: "CWE-390",
        });
      }
      if (fn.hasCircularDep) {
        add(i, "circular-call", {
          severity: "MEDIUM",
          category: "CODE_SMELL",
          title: `Circular call involving: ${fn.name}`,
          description: `Function "${fn.name}" is part of a circular call chain, which risks unbounded recursion and initialisation-order bugs.`,
          cweId: "CWE-1120",
        });
      }
      if (fn.cyclomaticComplexity >= 15) {
        add(i, "high-complexity", {
          severity: "MEDIUM",
          category: "VULNERABILITY",
          title: `High complexity function: ${fn.name} (CC=${fn.cyclomaticComplexity})`,
          description: `Cyclomatic complexity ${fn.cyclomaticComplexity} is at least 15; such functions are hard to audit and likely have untested paths.`,
          cweId: "CWE-1121",
        });
      }
    });
    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────

  private finish(graph: TopologyGraph, ids: IdAllocator, draft: Draft): SecurityScanResult {
    return make(ids, draft, findFunctionId(draft.range, graph), draft.title);
  }
}
/** " (awaits without try/catch, calls JSON.parse)": at most three reasons, or "" when unknown. */
function describeReasons(reasons: readonly string[] | undefined): string {
  if (reasons === undefined || reasons.length === 0) return "";
  const shown = reasons.slice(0, 3).join(", ");
  return reasons.length > 3 ? ` (${shown}, and ${reasons.length - 3} more)` : ` (${shown})`;
}
/**
 * Hands out finding ids that depend only on the finding's content, so the same input always
 * yields the same ids. Only exact duplicates within one batch get an ordinal suffix.
 */
class IdAllocator {
  private readonly seen = new Map<string, number>();
  next(parts: readonly string[]): string {
    const base = `finding-${contentHash(parts.join("\u0000"))}`;
    const count = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  }
}
/** 53-bit string hash (cyrb53), rendered as 14 hex digits. */
function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}
/** `discriminator` separates findings of one category in one place, e.g. a variable name. */
function make(ids: IdAllocator, draft: Draft, functionId: string | null, discriminator: string): SecurityScanResult {
  const findingId = ids.next([draft.sourceScanner, draft.category, functionId ?? draft.filePath, discriminator]);
  return { findingId, functionId, ...draft };
}
/** The innermost function containing the finding's first line, or null when the line is unknown. */
function findFunctionId(range: SourceRange, graph: TopologyGraph): string | null {
  if (range.startLine < 1) return null;
  let best: { id: string; span: number } | null = null;
  for (const fn of graph.functions) {
    if (!samePath(fn.filePath, range.filePath)) continue;
    if (fn.range.startLine > range.startLine || fn.range.endLine < range.startLine) continue;
    const span = fn.range.endLine - fn.range.startLine;
    if (best === null || span < best.span) best = { id: fn.id, span };
  }
  return best === null ? null : best.id;
}
