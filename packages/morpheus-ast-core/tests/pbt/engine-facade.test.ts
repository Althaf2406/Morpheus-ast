/**
 * tests/pbt/engine-facade.test.ts
 *
 * The two engine members added for the apps, exercised through createEngine() on the
 * pre-loaded sample: bugfix markdown rendering and external scanner ingestion.
 */

import * as fc from "fast-check";
import { createEngine } from "../../src/index.js";
import type {
  BugfixSpec,
  FunctionNode,
  MorpheusASTEngine,
  TopologyGraph,
} from "../../src/contracts.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");

describe("engine facade: bugfix markdown", () => {
  const engine: MorpheusASTEngine = createEngine();
  let graph: TopologyGraph;
  let spec: BugfixSpec;

  beforeAll(async () => {
    const sample = engine.getSampleRepository();
    const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: sample.files, includeSourceText: true });
    graph = await engine.buildTopologyGraph(parsed.files);
    const target = graph.functions.find((f) => f.name === "handleGetUsers")!;
    const fault = await engine.injectFault({ targetFunctionId: target.id, faultType: "UNCAUGHT_EXCEPTION" }, graph);
    spec = engine.generateBugfixSpec(fault, graph);
  });

  const withReplacement = (replacement: string): BugfixSpec => ({
    ...spec,
    suggestedMutation: {
      splices: [{ filePath: "sample/api-gateway.ts", startIndex: 0, endIndex: 0, replacement, description: "demo splice" }],
    },
  });

  it("F1: renders the three Kiro sections, the spec id and the fault", () => {
    const md = engine.generateBugfixMarkdown(spec);
    expect(md).toContain(`# Bugfix Spec: ${spec.title}`);
    expect(md).toContain(spec.specId);
    expect(md).toContain("## Current Behavior (Defect)");
    expect(md).toContain("## Expected Behavior (Correct)");
    expect(md).toContain("## Unchanged Behavior / Preservation Properties (Regression Prevention)");
    expect(md).toContain(spec.currentBehavior);
    expect(md).toContain(spec.expectedBehavior);
    expect(md).toContain(spec.unchangedBehavior);
    expect(md).not.toMatch(/undefined|NaN/);
  });

  it("F2: says so when there is no automated patch, and lists splices when there is", () => {
    expect(engine.generateBugfixMarkdown(spec)).toContain("No automated patch available");
    const md = engine.generateBugfixMarkdown(withReplacement("try { go(); } catch { /* ignore */ }"));
    expect(md).toContain("### Splice 1: demo splice");
    expect(md).not.toContain("No automated patch available");
  });

  it("F3: a replacement containing a code fence cannot close the block early", () => {
    const replacement = "x();\n```\n# Injected heading\n````\nmore";
    const md = engine.generateBugfixMarkdown(withReplacement(replacement));

    const longestRun = Math.max(...(replacement.match(/`+/g) ?? [""]).map((r) => r.length));
    const block = /(`{3,})typescript\n([\s\S]*?)\n\1\n/.exec(md);
    expect(block).not.toBeNull();
    expect(block![1]!.length).toBeGreaterThan(longestRun);
    expect(block![2]).toBe(replacement);
  });

  it("F3b: a splice description cannot start a new markdown line", () => {
    const md = engine.generateBugfixMarkdown({
      ...spec,
      suggestedMutation: {
        splices: [{ filePath: "a.ts", startIndex: 0, endIndex: 0, replacement: "x", description: "ok\n# Injected heading\n\n- bullet" }],
      },
    });
    expect(md).toContain("### Splice 1: ok # Injected heading - bullet");
    expect(md).not.toMatch(/^# Injected heading/m);
  });

  it("F4: for arbitrary replacement text the fenced block contains it exactly", () => {
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom("`", "`", "`", "a", "\n", "#", " "), { maxLength: 40 }), (replacement) => {
        const md = engine.generateBugfixMarkdown(withReplacement(replacement));
        const longestRun = Math.max(0, ...(replacement.match(/`+/g) ?? []).map((r) => r.length));
        const block = /(`{3,})typescript\n([\s\S]*?)\n\1\n/.exec(md);
        expect(block).not.toBeNull();
        expect(block![1]!.length).toBeGreaterThan(longestRun);
        expect(block![2]).toBe(replacement);
      }),
      { numRuns: RUNS }
    );
  });
});

describe("engine facade: external scanner ingestion", () => {
  const engine: MorpheusASTEngine = createEngine();
  let graph: TopologyGraph;
  let validate: FunctionNode;

  beforeAll(async () => {
    const sample = engine.getSampleRepository();
    const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: sample.files, includeSourceText: true });
    graph = await engine.buildTopologyGraph(parsed.files);
    validate = graph.functions.find((f) => f.name === "validateUserInput")!;
  });

  it("F5: an empty report yields no findings", () => {
    expect(engine.ingestExternalFindings({}, graph)).toEqual([]);
  });

  it("F6: findings from all four scanners are normalised, in order, with unique ids", () => {
    const line = validate.range.startLine + 2;
    const findings = engine.ingestExternalFindings(
      {
        sonarqube: [
          {
            key: "k", severity: "CRITICAL", type: "VULNERABILITY", message: "weak check", rule: "typescript:S1",
            component: `demo:${validate.filePath}`,
            textRange: { startLine: line, endLine: line, startOffset: 0, endOffset: 5 },
          },
        ],
        snyk: [{ id: "s", severity: "high", title: "Prototype Pollution", description: "d", packageName: "lodash", cvssScore: 7.4, cwe: ["CWE-1321"] }],
        awsSecurity: [{ Id: "a", Severity: { Label: "MEDIUM" }, Title: "Open policy", Description: "d", Resources: [{ Id: "arn:aws:s3:::bucket", Type: "Bucket" }], Types: [] }],
        aikido: [{ id: "k", severity_level: 2, name: "SQL injection", description: "d", affected_file: validate.filePath }],
      },
      graph
    );

    expect(findings.map((f) => f.sourceScanner)).toEqual(["SONARQUBE", "SNYK", "AWS_SECURITY_ANALYZER", "AIKIDO"]);
    expect(findings[0]!.functionId).toBe(validate.id);
    expect(findings[0]!.severity).toBe("CRITICAL");
    expect(findings[1]!.cvssScore).toBe(7.4);
    expect(findings[1]!.cweId).toBe("CWE-1321");
    expect(findings[3]!.category).toBe("INJECTION");
    expect(findings.slice(1).every((f) => f.functionId === null)).toBe(true);

    const ids = findings.map((f) => f.findingId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("F7: ids stay unique across repeated calls and across the internal scan", async () => {
    const report = { snyk: [{ id: "s", severity: "low", title: "t", description: "d", packageName: "p" }] };
    const sample = engine.getSampleRepository();
    const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: sample.files, includeSourceText: true });
    const all = [
      ...engine.ingestExternalFindings(report, graph),
      ...(await engine.runSecurityScan(parsed.files)),
      ...engine.ingestExternalFindings(report, graph),
    ].map((f) => f.findingId);
    expect(new Set(all).size).toBe(all.length);
  });
});
