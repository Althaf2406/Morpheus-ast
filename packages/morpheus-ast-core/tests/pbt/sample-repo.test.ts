/**
 * tests/pbt/sample-repo.test.ts
 *
 * Runs the pre-loaded sample repository through the real engine pipeline with no
 * file system, login or upload, which is exactly what a judge's browser session does.
 */

import { createEngine } from "../../src/index.js";
import { SAMPLE_REPO_EXPECTED } from "../../src/sample-repo/index.js";
import type { MorpheusASTEngine, ParseResult, TopologyGraph } from "../../src/contracts.js";

describe("pre-loaded sample repository", () => {
  const engine: MorpheusASTEngine = createEngine();
  let parsed: ParseResult;
  let graph: TopologyGraph;

  beforeAll(async () => {
    const sample = engine.getSampleRepository();
    parsed = await engine.parseSourceFiles({
      filePaths: [],
      virtualFiles: sample.files,
      includeSourceText: true,
    });
    graph = await engine.buildTopologyGraph(parsed.files);
  });

  it("exposes three files and parses them with zero syntax errors", () => {
    expect(engine.getSampleRepository().files).toHaveLength(3);
    expect(parsed.files).toHaveLength(3);
    for (const file of parsed.files) {
      expect(file.errors).toEqual([]);
      expect(file.sourceText.length).toBeGreaterThan(0);
    }
  });

  it("builds a topology that meets the documented expectations", () => {
    const names = new Set(graph.functions.map((f) => f.name));
    // eslint-disable-next-line no-console
    console.log(
      `sample metrics: functions=${graph.functions.length} edges=${graph.edges.length} ` +
        `cycles=${graph.circularDepCount} totalCC=${graph.totalComplexity} ` +
        `maxCC=${Math.max(...graph.functions.map((f) => f.cyclomaticComplexity))}`
    );

    expect(graph.functions.length).toBeGreaterThanOrEqual(SAMPLE_REPO_EXPECTED.minFunctions);
    expect(graph.edges.length).toBeGreaterThanOrEqual(SAMPLE_REPO_EXPECTED.minEdges);
    expect(graph.circularDepCount).toBeGreaterThanOrEqual(SAMPLE_REPO_EXPECTED.minCircularDeps);

    for (const name of SAMPLE_REPO_EXPECTED.highComplexityFunctionNames) {
      const fn = graph.functions.find((f) => f.name === name);
      expect(fn).toBeDefined();
      expect(fn!.cyclomaticComplexity).toBeGreaterThanOrEqual(SAMPLE_REPO_EXPECTED.highComplexityThreshold);
    }
    for (const name of SAMPLE_REPO_EXPECTED.uncaughtExceptionFunctions) {
      expect(names.has(name)).toBe(true);
      expect(graph.functions.find((f) => f.name === name)!.hasUncaughtException).toBe(true);
    }
    const unused = graph.functions.flatMap((f) => f.unusedVariables);
    for (const variable of SAMPLE_REPO_EXPECTED.unusedVariables) {
      expect(unused).toContain(variable);
    }
  });

  it("contains a real call cycle and edges that cross files", () => {
    const fileOf = new Map(graph.functions.map((f) => [f.id, f.filePath]));
    const crossFile = graph.edges.filter((e) => fileOf.get(e.callerId) !== fileOf.get(e.calleeId));
    expect(crossFile.length).toBeGreaterThan(0);
    expect(graph.edges.some((e) => e.isCyclic)).toBe(true);
  });

  it("produces security findings from the sample", async () => {
    const findings = await engine.runSecurityScan(parsed.files);
    expect(findings.length).toBeGreaterThanOrEqual(SAMPLE_REPO_EXPECTED.minSecurityFindings);
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has("UNCAUGHT_EXCEPTION")).toBe(true);
    expect(categories.has("UNUSED_VARIABLE")).toBe(true);
  });

  it("injects a fault into the sample and generates a bugfix spec", async () => {
    const target = graph.functions.find((f) => f.name === "handleGetUsers");
    expect(target).toBeDefined();
    const fault = await engine.injectFault(
      { targetFunctionId: target!.id, faultType: "UNCAUGHT_EXCEPTION" },
      graph
    );
    expect(fault.affectedNodes).toContain(target!.id);
    expect(fault.blastRadiusScore).toBeGreaterThan(0);

    const spec = engine.generateBugfixSpec(fault, graph);
    expect(spec.currentBehavior.length).toBeGreaterThan(0);
    expect(spec.expectedBehavior.length).toBeGreaterThan(0);
    expect(spec.unchangedBehavior.length).toBeGreaterThan(0);
  });

  it("mutates a sample file in memory and rolls it back byte-for-byte", () => {
    const file = engine.getSampleRepository().files.find((f) => f.filePath.endsWith("user-service.ts"))!;
    const marker = "if (data == null) throw new Error(\"Data is null\");";
    const start = file.sourceText.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const result = engine.applyMutationToText(file.sourceText, [
      {
        filePath: file.filePath,
        startIndex: start,
        endIndex: start + marker.length,
        replacement: "if (data == null) { return {}; }",
        description: "replace throw with safe default",
      },
    ]);
    expect(result.mutatedSource).not.toBe(file.sourceText);
    expect(engine.rollbackMutationText(result.mutatedSource, result.rollbackRecord)).toBe(file.sourceText);
  });
});
