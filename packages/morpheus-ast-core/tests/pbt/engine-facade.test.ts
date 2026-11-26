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
  VirtualFile,
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

  it("F3c: whitespace-only insertions are merged into one summary entry; code splices stay listed and numbered", () => {
    const splice = (startIndex: number, replacement: string, description: string, endIndex = startIndex) => ({
      filePath: "sample/api-gateway.ts", startIndex, endIndex, replacement, description,
    });
    const md = engine.generateBugfixMarkdown({
      ...spec,
      suggestedMutation: {
        splices: [
          splice(90, "\n} catch (error) {\n  throw error;\n}", "Close try block"),
          splice(60, "  ", "Indent one level"),
          splice(40, "  ", "Indent one level"),
          splice(20, "\t", "Indent one level"),
          splice(0, "try {\n  ", "Open try block", 4),
        ],
      },
    });
    expect(md.match(/^### Whitespace-only splices: 3 insertions$/gm)).toHaveLength(1);
    expect(md).toContain("bytes `[20, 60)` (5 whitespace characters inserted, no code added or removed)");
    expect(md).toContain("### Splice 1: Close try block");
    expect(md).toContain("### Splice 2: Open try block");
    expect(md).not.toContain("### Splice 3");
    expect(md).not.toContain("Indent one level");
    expect(md.indexOf("Splice 1")).toBeLessThan(md.indexOf("Whitespace-only"));
    expect(md.indexOf("Whitespace-only")).toBeLessThan(md.indexOf("Splice 2"));
  });
  it("F3d: a lone whitespace insertion is summarised in the singular, and a whitespace replacement of code is kept", () => {
    const one = engine.generateBugfixMarkdown(withReplacement("  "));
    expect(one).toContain("### Whitespace-only splices: 1 insertion\n");
    expect(one).not.toContain("### Splice 1");
    const removal = engine.generateBugfixMarkdown({
      ...spec,
      suggestedMutation: { splices: [{ filePath: "a.ts", startIndex: 0, endIndex: 5, replacement: " ", description: "drop code" }] },
    });
    expect(removal).toContain("### Splice 1: drop code");
  });
  it("F4: for arbitrary replacement text the fenced block contains it exactly", () => {
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom("`", "`", "`", "a", "\n", "#", " "), { maxLength: 40 }).filter((r) => r.trim() !== ""), (replacement) => {
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

  it("F7: the same input gives identical ids on repeated calls, and ids stay unique within a batch", async () => {
    const report = { snyk: [{ id: "s", severity: "low", title: "t", description: "d", packageName: "p" }] };
    const sample = engine.getSampleRepository();
    const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: sample.files, includeSourceText: true });
    const first = engine.ingestExternalFindings(report, graph).map((f) => f.findingId);
    const second = engine.ingestExternalFindings(report, graph).map((f) => f.findingId);
    expect(second).toEqual(first);
    const internal = (await engine.runSecurityScan(parsed.files)).map((f) => f.findingId);
    expect(new Set(internal).size).toBe(internal.length);
    expect((await engine.runSecurityScan(parsed.files)).map((f) => f.findingId)).toEqual(internal);
  });
  it("F8: exact duplicates get distinct ids, deterministically", () => {
    const dup = { id: "s", severity: "low", title: "t", description: "d", packageName: "p" };
    const a = engine.ingestExternalFindings({ snyk: [dup, dup, dup] }, graph).map((f) => f.findingId);
    const b = engine.ingestExternalFindings({ snyk: [dup, dup, dup] }, graph).map((f) => f.findingId);
    expect(new Set(a).size).toBe(3);
    expect(b).toEqual(a);
  });
});
describe("engine facade: finding id stability (PBT)", () => {
  const engine: MorpheusASTEngine = createEngine();
  const scanIds = async (files: readonly VirtualFile[]): Promise<readonly string[]> => {
    const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: files, includeSourceText: true });
    return (await engine.runSecurityScan(parsed.files)).map((f) => f.findingId).sort();
  };
  it("F9: analysing the same source twice yields the same id set", async () => {
    const files = engine.getSampleRepository().files;
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: files.length - 1 }), async (n) => {
        const subset = files.slice(0, n + 1);
        expect(await scanIds(subset)).toEqual(await scanIds(subset));
      }),
      { numRuns: Math.min(RUNS, 30) }
    );
  });
  it("F10: apply then rollback yields the same id set as before apply", async () => {
    const files = engine.getSampleRepository().files;
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: files.length - 1 }),
        fc.stringOf(fc.constantFrom("a", "b", " ", "x", "1"), { maxLength: 12 }),
        async (pick, text) => {
          const target = files[pick]!;
          const before = await scanIds(files);
          const { mutatedSource, rollbackRecord } = engine.applyMutationToText(target.sourceText, [
            { filePath: target.filePath, startIndex: 0, endIndex: 0, replacement: `// ${text}\n`, description: "prepend comment" },
          ]);
          const restored = engine.rollbackMutationText(mutatedSource, rollbackRecord);
          expect(restored).toBe(target.sourceText);
          const after = await scanIds(files.map((f) => (f === target ? { ...f, sourceText: restored } : f)));
          expect(after).toEqual(before);
        }
      ),
      { numRuns: Math.min(RUNS, 30) }
    );
  });
});
