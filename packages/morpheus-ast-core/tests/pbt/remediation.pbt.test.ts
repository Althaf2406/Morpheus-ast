/**
 * tests/pbt/remediation.pbt.test.ts
 *
 * Property-based tests for deterministic remediation (Feature: deterministic-remediation).
 *
 * Properties in task 3.2: 7 to 12 (uncaught exception remediation), at the end of the file.
 *
 * Properties in this section (task 2.2):
 *   Property 5 — Unused-variable removal eliminates the finding on re-analysis
 *   Property 6 — Unused-variable removal targets only the declared variable
 *
 * Inputs come from two generators: synthetic source text produced by fast-check, and files
 * of the pre-loaded sample repository.
 */

import * as fc from "fast-check";
import * as ts from "typescript";
import * as vm from "node:vm";
import fs = require("node:fs");
import { createEngine } from "../../src/index.js";
import { SurgicalMutator } from "../../src/mutator/index.js";
import type {
  MorpheusASTEngine,
  MutationRequest,
  RemediationOptions,
  SecurityScanResult,
  TopologyGraph,
} from "../../src/contracts.js";

const NUM_RUNS = 100;
const FILE_PATH = "synthetic/target.ts";

const engine: MorpheusASTEngine = createEngine();
const mutator = new SurgicalMutator();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseTs(source: string): ts.SourceFile {
  return ts.createSourceFile("x.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Offsets of the identifier of the first variable declaration called `name`. */
function findDeclaratorName(source: string, name: string): { start: number; end: number } | null {
  const sf = parseTs(source);
  let found: { start: number; end: number } | null = null;
  const visit = (node: ts.Node): void => {
    if (found !== null) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = { start: node.name.getStart(sf), end: node.name.getEnd() };
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Names of all variable declarators in the source, in source order. */
function declaredNames(source: string): string[] {
  const sf = parseTs(source);
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) names.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

function makeFinding(
  source: string,
  filePath: string,
  start: number,
  end: number,
  functionId: string | null
): SecurityScanResult {
  const sf = parseTs(source);
  const a = sf.getLineAndCharacterOfPosition(start);
  const b = sf.getLineAndCharacterOfPosition(end);
  return {
    findingId: `pbt-${start}-${end}`,
    severity: "LOW",
    category: "UNUSED_VARIABLE",
    title: "Unused variable",
    description: "Variable is declared but never used.",
    filePath,
    range: {
      filePath,
      startLine: a.line + 1,
      startColumn: a.character,
      endLine: b.line + 1,
      endColumn: b.character,
      startIndex: start,
      endIndex: end,
    },
    functionId,
    sourceScanner: "INTERNAL",
    cweId: null,
    cvssScore: null,
  };
}

async function analyze(
  source: string,
  filePath: string
): Promise<{ graph: TopologyGraph; errors: number }> {
  const parsed = await engine.parseSourceFiles({
    filePaths: [],
    virtualFiles: [{ filePath, sourceText: source }],
    includeSourceText: true,
  });
  const graph = await engine.buildTopologyGraph(parsed.files);
  return { graph, errors: parsed.files.reduce((n, f) => n + f.errors.length, 0) };
}

function assertSplicesSane(request: MutationRequest, source: string): void {
  const sorted = [...request.splices].sort((x, y) => x.startIndex - y.startIndex);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]!;
    expect(s.startIndex).toBeGreaterThanOrEqual(0);
    expect(s.endIndex).toBeLessThanOrEqual(source.length);
    expect(s.startIndex).toBeLessThanOrEqual(s.endIndex);
    if (i > 0) expect(sorted[i - 1]!.endIndex).toBeLessThanOrEqual(s.startIndex);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator: a function with one unused variable among other (used) declarators
// ─────────────────────────────────────────────────────────────────────────────

const PURE_INITIALIZERS = ["1", "p + 2", "[p, 3]", "{ a: p }", "`t${p}`", "p > 1 ? p : 0"] as const;
const EFFECT_INITIALIZERS = [
  "sideEffect(p)",
  "new Widget(p)",
  "p++",
  "{ a: sideEffect(p) }",
  "(counter = p)",
] as const;

interface UnusedCase {
  readonly source: string;
  readonly target: string;
  readonly siblings: readonly string[];
  readonly hasEffect: boolean;
  readonly functionName: string;
}

interface DeclSpec {
  readonly init: string;
  readonly effect: boolean;
}

const declSpecArb: fc.Arbitrary<DeclSpec> = fc.oneof(
  fc.constantFrom(...PURE_INITIALIZERS).map((init) => ({ init, effect: false })),
  fc.constantFrom(...EFFECT_INITIALIZERS).map((init) => ({ init, effect: true }))
);

/** statements: array of declarator-spec lists; exactly one declarator overall is the target. */
const unusedCaseArb: fc.Arbitrary<UnusedCase> = fc
  .record({
    shape: fc.array(fc.array(declSpecArb, { minLength: 1, maxLength: 3 }), {
      minLength: 1,
      maxLength: 4,
    }),
    keyword: fc.constantFrom("const", "let", "var"),
    asArrow: fc.boolean(),
    crlf: fc.boolean(),
    indent: fc.constantFrom("  ", "    ", "\t"),
    trailingSemicolon: fc.boolean(),
  })
  .chain((r) => {
    const total = r.shape.reduce((n, s) => n + s.length, 0);
    return fc.integer({ min: 0, max: total - 1 }).map((targetIndex): UnusedCase => {
      const nl = r.crlf ? "\r\n" : "\n";
      let counter = 0;
      let target = "";
      let hasEffect = false;
      const siblings: string[] = [];
      const lines: string[] = [];
      for (const stmt of r.shape) {
        const parts: string[] = [];
        for (const spec of stmt) {
          const name = `v${counter}`;
          if (counter === targetIndex) {
            target = name;
            hasEffect = spec.effect;
          } else {
            siblings.push(name);
          }
          parts.push(`${name} = ${spec.init}`);
          counter += 1;
        }
        lines.push(`${r.indent}${r.keyword} ${parts.join(", ")}${r.trailingSemicolon ? ";" : ""}`);
      }
      lines.push(`${r.indent}return [${siblings.join(", ")}];`);
      const body = lines.join(nl);
      const functionName = "subject";
      const source = r.asArrow
        ? `const ${functionName} = (p: number) => {${nl}${body}${nl}};${nl}`
        : `function ${functionName}(p: number) {${nl}${body}${nl}}${nl}`;
      return { source, target, siblings, hasEffect, functionName };
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// Sample-repository inputs
// ─────────────────────────────────────────────────────────────────────────────

interface SampleCase {
  readonly filePath: string;
  readonly source: string;
  readonly name: string;
  readonly functionName: string;
  readonly functionId: string;
}

let sampleCases: SampleCase[] = [];

beforeAll(async () => {
  const sample = engine.getSampleRepository();
  const parsed = await engine.parseSourceFiles({
    filePaths: [],
    virtualFiles: sample.files,
    includeSourceText: true,
  });
  const graph = await engine.buildTopologyGraph(parsed.files);
  const textByPath = new Map(parsed.files.map((f) => [f.filePath, f.sourceText] as const));
  const cases: SampleCase[] = [];
  for (const fn of graph.functions) {
    const source = textByPath.get(fn.filePath);
    if (source === undefined) continue;
    for (const name of fn.unusedVariables) {
      cases.push({
        filePath: fn.filePath,
        source,
        name,
        functionName: fn.name,
        functionId: fn.id,
      });
    }
  }
  sampleCases = cases;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("remediation PBT: unused variable", () => {
  // Feature: deterministic-remediation, Property 5: Unused-variable removal eliminates the finding on re-analysis
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  it("Property 5: applying the plan removes the variable from unusedVariables and keeps siblings (synthetic)", async () => {
    await fc.assert(
      fc.asyncProperty(unusedCaseArb, async (c) => {
        const before = await analyze(c.source, FILE_PATH);
        expect(before.errors).toBe(0);
        const beforeFn = before.graph.functions.find((f) => f.name === c.functionName);
        expect(beforeFn?.unusedVariables).toEqual([c.target]);

        const loc = findDeclaratorName(c.source, c.target);
        expect(loc).not.toBeNull();
        const finding = makeFinding(c.source, FILE_PATH, loc!.start, loc!.end, beforeFn!.id);

        const plan = engine.planRemediation(finding, c.source);
        expect(plan).not.toBeNull();
        assertSplicesSane(plan!, c.source);

        const { mutated } = mutator.applyToString(c.source, plan!.splices);
        const after = await analyze(mutated, FILE_PATH);
        expect(after.errors).toBe(0);
        const afterFn = after.graph.functions.find((f) => f.name === c.functionName);
        expect(afterFn).toBeDefined();
        expect(afterFn!.unusedVariables).toEqual([]);

        // Siblings from the same statements are still declared; the target is gone.
        const names = declaredNames(mutated);
        for (const s of c.siblings) expect(names).toContain(s);
        expect(names).not.toContain(c.target);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: deterministic-remediation, Property 5: Unused-variable removal eliminates the finding on re-analysis
  // **Validates: Requirements 2.1, 2.2, 2.4**
  it("Property 5: applying the plan removes the variable from unusedVariables (sample repository)", async () => {
    expect(sampleCases.length).toBeGreaterThan(0);
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...sampleCases), async (c) => {
        const loc = findDeclaratorName(c.source, c.name);
        expect(loc).not.toBeNull();
        const finding = makeFinding(c.source, c.filePath, loc!.start, loc!.end, c.functionId);

        const plan = engine.planRemediation(finding, c.source);
        expect(plan).not.toBeNull();
        assertSplicesSane(plan!, c.source);

        const { mutated, rollbackRecord } = mutator.applyToString(c.source, plan!.splices);
        expect(mutator.rollbackString(mutated, rollbackRecord)).toBe(c.source);

        const after = await analyze(mutated, c.filePath);
        expect(after.errors).toBe(0);
        const afterFn = after.graph.functions.find(
          (f) => f.name === c.functionName && f.filePath === c.filePath
        );
        expect(afterFn).toBeDefined();
        expect(afterFn!.unusedVariables).not.toContain(c.name);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: deterministic-remediation, Property 6: Unused-variable removal targets only the declared variable
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.5**
  it("Property 6: splices stay inside the target declaration and side effects are preserved", () => {
    fc.assert(
      fc.property(unusedCaseArb, (c) => {
        const loc = findDeclaratorName(c.source, c.target);
        expect(loc).not.toBeNull();
        const finding = makeFinding(c.source, FILE_PATH, loc!.start, loc!.end, null);
        const plan = engine.planRemediation(finding, c.source);
        expect(plan).not.toBeNull();

        // Locate the statement that holds the target.
        const sf = parseTs(c.source);
        let stmtStart = -1;
        let stmtEnd = -1;
        const visit = (node: ts.Node): void => {
          if (ts.isVariableStatement(node)) {
            for (const d of node.declarationList.declarations) {
              if (ts.isIdentifier(d.name) && d.name.text === c.target) {
                stmtStart = node.getFullStart();
                stmtEnd = node.getEnd();
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
        expect(stmtStart).toBeGreaterThanOrEqual(0);

        // Allow the line break that belongs to a removed statement, and a statement
        // inserted just after the declaration (side-effect initializer, several declarators).
        const lineBreakAllowance = 2;
        for (const s of plan!.splices) {
          expect(s.startIndex).toBeGreaterThanOrEqual(stmtStart);
          expect(s.endIndex).toBeLessThanOrEqual(stmtEnd + lineBreakAllowance);
        }

        const { mutated } = mutator.applyToString(c.source, plan!.splices);

        // Bytes outside the affected region are untouched.
        const first = Math.min(...plan!.splices.map((s) => s.startIndex));
        const last = Math.max(...plan!.splices.map((s) => s.endIndex));
        expect(mutated.startsWith(c.source.slice(0, first))).toBe(true);
        expect(mutated.endsWith(c.source.slice(last))).toBe(true);

        // Only the target disappears from the declared names; all others stay in order.
        expect(declaredNames(mutated)).toEqual(declaredNames(c.source).filter((n) => n !== c.target));

        // A side-effect initializer survives as an expression statement.
        const kept = /sideEffect\(|new Widget\(|p\+\+|counter = p/.test(mutated);
        if (c.hasEffect) expect(kept).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: deterministic-remediation, Property 6: Unused-variable removal targets only the declared variable
  // **Validates: Requirements 2.5**
  it("Property 6: a name that is not declared inside the function yields null", () => {
    fc.assert(
      fc.property(unusedCaseArb, (c) => {
        // Point the finding at the parameter `p`, which is not a variable declarator.
        const start = c.source.indexOf("(p:") + 1;
        expect(start).toBeGreaterThan(0);
        const finding = makeFinding(c.source, FILE_PATH, start, start + 1, null);
        expect(engine.planRemediation(finding, c.source)).toBeNull();

        // A range outside every function cannot be resolved.
        const outside = makeFinding(c.source, FILE_PATH, c.source.length, c.source.length, null);
        expect(engine.planRemediation(outside, c.source)).toBeNull();
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Uncaught exception remediation (task 3.2): Properties 7 to 12
// ─────────────────────────────────────────────────────────────────────────────
/** Options object lacking the `errorCause` field. The single cast is intentional: the
 *  contract types the field as required, but callers may omit it at run time. */
const OPTIONS_WITHOUT_FIELD = {} as Partial<RemediationOptions> as RemediationOptions;
type OptionsArg = RemediationOptions | undefined;
const CAUSE_OPTIONS: RemediationOptions = { errorCause: true };
const PLAIN_ARGS: readonly OptionsArg[] = [{ errorCause: false }, OPTIONS_WITHOUT_FIELD, undefined];
const BOTH_FORMS: readonly OptionsArg[] = [CAUSE_OPTIONS, ...PLAIN_ARGS];
function plan(finding: SecurityScanResult, source: string, options: OptionsArg): MutationRequest | null {
  return options === undefined
    ? engine.planRemediation(finding, source)
    : engine.planRemediation(finding, source, options);
}
interface UncaughtCase {
  readonly source: string;
  readonly functionName: string;
  readonly isAsync: boolean;
}
/** Functions with at least one risky operation (throw, await or a known-throwing call) outside a try block. */
const uncaughtCaseArb: fc.Arbitrary<UncaughtCase> = fc
  .record({
    asArrow: fc.boolean(),
    isAsync: fc.boolean(),
    crlf: fc.boolean(),
    indent: fc.constantFrom("  ", "    ", "\t"),
    preamble: fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 2 }),
    trigger: fc.constantFrom(
      "JSON.parse(String(p));",
      "if (p > 1) { JSON.parse(String(p)); }",
      'throw new Error("bad");',
      "const r = JSON.parse(String(p));",
      "await Promise.resolve(p);"
    ),
    ret: fc.boolean(),
    name: fc.constantFrom("subject", "runTask", "handler2"),
  })
  .map((r): UncaughtCase => {
    const nl = r.crlf ? "\r\n" : "\n";
    const trigger = !r.isAsync && r.trigger.startsWith("await") ? "JSON.parse(String(p));" : r.trigger;
    const lines = [
      ...r.preamble.map((k, i) => `${r.indent}const w${i} = p + ${k};`),
      `${r.indent}${trigger}`,
      ...(r.ret ? [`${r.indent}return p;`] : []),
    ];
    const body = lines.join(nl);
    const prefix = r.isAsync ? "async " : "";
    const source = r.asArrow
      ? `const ${r.name} = ${prefix}(p: number) => {${nl}${body}${nl}};${nl}`
      : `${prefix}function ${r.name}(p: number) {${nl}${body}${nl}}${nl}`;
    return { source, functionName: r.name, isAsync: r.isAsync };
  });
/** Builds the UNCAUGHT_EXCEPTION finding for the named function from engine analysis. */
async function uncaughtFindingFor(
  source: string,
  filePath: string,
  functionName: string
): Promise<SecurityScanResult | null> {
  const { graph } = await analyze(source, filePath);
  const fn = graph.functions.find((f) => f.name === functionName && f.filePath === filePath);
  if (fn === undefined || !fn.hasUncaughtException) return null;
  const finding = makeFinding(source, filePath, fn.range.startIndex, fn.range.endIndex, fn.id);
  return { ...finding, category: "UNCAUGHT_EXCEPTION", title: "Uncaught exception" };
}
function apply(source: string, request: MutationRequest): string {
  return mutator.applyToString(source, request.splices).mutated;
}
/** The inserted catch clause text: from "catch (" to the end of the output. */
function insertedParts(request: MutationRequest): string {
  return request.splices.map((s) => s.replacement).join("");
}
describe("remediation PBT: uncaught exception", () => {
  // Feature: deterministic-remediation, Property 7: The errorCause option selects the Catch_Form
  // **Validates: Requirements 1.10, 3.1, 3.2**
  it("Property 7: errorCause true yields the Cause_Form; false, missing field and omitted yield the Plain_Form", async () => {
    await fc.assert(
      fc.asyncProperty(uncaughtCaseArb, async (c) => {
        const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
        expect(finding).not.toBeNull();
        const cause = plan(finding!, c.source, CAUSE_OPTIONS);
        expect(cause).not.toBeNull();
        const causeText = insertedParts(cause!);
        expect(causeText).toContain(`throw new Error("${c.functionName} failed", { cause: error });`);
        for (const options of PLAIN_ARGS) {
          const request = plan(finding!, c.source, options);
          expect(request).not.toBeNull();
          const text = insertedParts(request!);
          expect(text).toContain(`throw new Error(\`${c.functionName} failed: \${String(error)}\`);`);
          expect(text).not.toContain("cause");
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 8: Uncaught-exception wrapping eliminates the finding on re-analysis, in either form
  // **Validates: Requirements 3.4**
  it("Property 8: re-analysis reports no uncaught exception path after the plan is applied (synthetic)", async () => {
    await fc.assert(
      fc.asyncProperty(uncaughtCaseArb, fc.boolean(), async (c, errorCause) => {
        const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
        expect(finding).not.toBeNull();
        const request = engine.planRemediation(finding!, c.source, { errorCause });
        expect(request).not.toBeNull();
        assertSplicesSane(request!, c.source);
        const { mutated, rollbackRecord } = mutator.applyToString(c.source, request!.splices);
        expect(mutator.rollbackString(mutated, rollbackRecord)).toBe(c.source);
        const after = await analyze(mutated, FILE_PATH);
        expect(after.errors).toBe(0);
        const fn = after.graph.functions.find((f) => f.name === c.functionName);
        expect(fn).toBeDefined();
        expect(fn!.hasUncaughtException).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 8: Uncaught-exception wrapping eliminates the finding on re-analysis, in either form
  // **Validates: Requirements 3.4**
  it("Property 8: re-analysis reports no uncaught exception path (sample repository)", async () => {
    const sample = engine.getSampleRepository();
    const parsed = await engine.parseSourceFiles({
      filePaths: [],
      virtualFiles: sample.files,
      includeSourceText: true,
    });
    const graph = await engine.buildTopologyGraph(parsed.files);
    const textByPath = new Map(parsed.files.map((f) => [f.filePath, f.sourceText] as const));
    const targets = graph.functions.filter((f) => f.hasUncaughtException);
    expect(targets.length).toBeGreaterThan(0);
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...targets), fc.boolean(), async (fn, errorCause) => {
        const source = textByPath.get(fn.filePath)!;
        const base = makeFinding(source, fn.filePath, fn.range.startIndex, fn.range.endIndex, fn.id);
        const finding: SecurityScanResult = { ...base, category: "UNCAUGHT_EXCEPTION" };
        const request = engine.planRemediation(finding, source, { errorCause });
        if (request === null) return; // e.g. a function without a block body
        assertSplicesSane(request, source);
        const mutated = apply(source, request);
        const after = await analyze(mutated, fn.filePath);
        expect(after.errors).toBe(0);
        const again = after.graph.functions.filter(
          (f) => f.name === fn.name && f.filePath === fn.filePath
        );
        expect(again.length).toBeGreaterThan(0);
        // Same-named functions share a name, so require the targeted one to be clean by count.
        const before = graph.functions.filter((f) => f.name === fn.name && f.filePath === fn.filePath);
        const dirtyBefore = before.filter((f) => f.hasUncaughtException).length;
        const dirtyAfter = again.filter((f) => f.hasUncaughtException).length;
        expect(dirtyAfter).toBe(dirtyBefore - 1);
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 9: A throwing function still throws after remediation, with context, in either form
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7**
  it("Property 9: the remediated function still throws or rejects with context", async () => {
    class OriginalError extends Error {}
    const thrownArb: fc.Arbitrary<unknown> = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant({ a: 1 }),
      fc.string().map((m) => new OriginalError(m))
    );
    const shapeArb = fc.record({
      asArrow: fc.boolean(),
      isAsync: fc.boolean(),
      name: fc.constantFrom("subject", "runTask", "handler2"),
      errorCause: fc.boolean(),
      pre: fc.boolean(),
    });
    await fc.assert(
      fc.asyncProperty(shapeArb, thrownArb, async (shape, original) => {
        const prefix = shape.isAsync ? "async " : "";
        const pre = shape.pre ? "  helper(p);\n" : "";
        const body = `${pre}  throw p;`;
        const source = shape.asArrow
          ? `const ${shape.name} = ${prefix}(p: unknown) => {\n${body}\n};\n`
          : `${prefix}function ${shape.name}(p: unknown) {\n${body}\n}\n`;
        const finding = await uncaughtFindingFor(source, FILE_PATH, shape.name);
        expect(finding).not.toBeNull();
        const request = engine.planRemediation(finding!, source, { errorCause: shape.errorCause });
        expect(request).not.toBeNull();
        const mutated = apply(source, request!);
        const js = ts.transpileModule(mutated, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
        }).outputText;
        const context = vm.createContext({ helper: () => undefined });
        const fn = vm.runInContext(`${js}\n${shape.name};`, context) as (p: unknown) => unknown;
        let caught: unknown;
        let threw = false;
        try {
          await fn(original);
        } catch (e) {
          threw = true;
          caught = e;
        }
        expect(threw).toBe(true);
        const err = caught as { message: string; cause?: unknown };
        if (shape.errorCause) {
          expect(err.message).toBe(`${shape.name} failed`);
          expect(err.cause).toBe(original);
        } else {
          expect(err.message).toBe(`${shape.name} failed: ${String(original)}`);
          expect("cause" in err).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 10: Uncaught-exception plans only insert text, regardless of form
  // **Validates: Requirements 3.8**
  it("Property 10: splices are insertions that remove no original text, one per line", async () => {
    await fc.assert(
      fc.asyncProperty(uncaughtCaseArb, fc.constantFrom(...BOTH_FORMS), async (c, options) => {
        const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
        expect(finding).not.toBeNull();
        const request = plan(finding!, c.source, options);
        expect(request).not.toBeNull();
        const starts = request!.splices.map((s) => s.startIndex);
        expect(new Set(starts).size).toBe(starts.length);
        for (const s of request!.splices) {
          const replaced = c.source.slice(s.startIndex, s.endIndex);
          expect(replaced.trim()).toBe("");
          expect(s.replacement.startsWith(replaced)).toBe(true);
        }
        const mutated = apply(c.source, request!);
        const stripWhitespace = (t: string): string => t.replace(/\s+/g, "");
        const inserted = stripWhitespace(insertedParts(request!));
        const original = stripWhitespace(c.source);
        expect(stripWhitespace(mutated).length).toBe(original.length + inserted.length);
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, formatting: body lines keep their indentation plus one level
  it("Property 10b: every original body line gains exactly one indentation level and try/catch are aligned", async () => {
    await fc.assert(
      fc.asyncProperty(uncaughtCaseArb, fc.boolean(), async (c, errorCause) => {
        const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
        expect(finding).not.toBeNull();
        const request = engine.planRemediation(finding!, c.source, { errorCause });
        expect(request).not.toBeNull();
        const mutated = apply(c.source, request!);
        const original = c.source.split(/\r?\n/);
        const out = mutated.split(/\r?\n/);
        const widths = original.filter((l) => /^ +\S/.test(l)).map((l) => l.length - l.trimStart().length);
        const unit = original.some((l) => l.startsWith("\t")) ? "\t" : " ".repeat(Math.min(...widths));
        const tryAt = out.findIndex((l) => l.trim() === "try {");
        const catchAt = out.findIndex((l) => /^\s*} catch \(\w+\) \{$/.test(l));
        expect(tryAt).toBeGreaterThan(0);
        expect(catchAt).toBeGreaterThan(tryAt);
        const bodyIndent = out[tryAt]!.slice(0, out[tryAt]!.length - "try {".length);
        expect(bodyIndent).toBe(unit);
        expect(out[catchAt]!.startsWith(`${bodyIndent}} catch (`)).toBe(true);
        expect(out[catchAt + 1]!.startsWith(`${bodyIndent}${unit}throw new Error(`)).toBe(true);
        expect(out[catchAt + 2]).toBe(`${bodyIndent}}`);
        const bodyLines = original.slice(1, original.length - 2);
        const wrapped = out.slice(tryAt + 1, catchAt);
        expect(wrapped).toHaveLength(bodyLines.length);
        bodyLines.forEach((line, i) => {
          expect(wrapped[i]).toBe(`${unit}${line}`);
        });
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 11: Async functions stay wrapped in the same async function
  // **Validates: Requirements 3.7**
  it("Property 11: the async modifier and signature are preserved and one try is added", async () => {
    const asyncArb = uncaughtCaseArb.filter((c) => c.isAsync);
    await fc.assert(
      fc.asyncProperty(asyncArb, fc.constantFrom(...BOTH_FORMS), async (c, options) => {
        const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
        expect(finding).not.toBeNull();
        const request = plan(finding!, c.source, options);
        expect(request).not.toBeNull();
        const mutated = apply(c.source, request!);
        const sf = parseTs(mutated);
        const fns: ts.FunctionLikeDeclaration[] = [];
        const tries: ts.TryStatement[] = [];
        const visit = (node: ts.Node): void => {
          if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) fns.push(node);
          if (ts.isTryStatement(node)) tries.push(node);
          ts.forEachChild(node, visit);
        };
        visit(sf);
        expect(fns).toHaveLength(1);
        const fn = fns[0]!;
        expect(fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)).toBe(true);
        expect(tries).toHaveLength(1);
        // The signature text before the body is byte-identical.
        const originalFn = parseTs(c.source).statements[0]!;
        const headerEnd = (n: ts.Node): number => {
          const body = ts.isVariableStatement(n)
            ? (n.declarationList.declarations[0]!.initializer as ts.ArrowFunction).body
            : (n as ts.FunctionDeclaration).body!;
          return body.getStart() + 1;
        };
        expect(mutated.slice(0, headerEnd(sf.statements[0]!))).toBe(
          c.source.slice(0, headerEnd(originalFn))
        );
        // The try block is the sole statement in the function body.
        const body = ts.isArrowFunction(fn) ? fn.body : fn.body!;
        expect(ts.isBlock(body) && body.statements.length === 1 && body.statements[0] === tries[0]).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });
  // Feature: deterministic-remediation, Property 12: No file system access
  // **Validates: Requirements 1.9, 5.11**
  it("Property 12: planRemediation performs no file system reads or writes", async () => {
    const names = [
      "readFileSync",
      "readFile",
      "writeFileSync",
      "writeFile",
      "appendFileSync",
      "appendFile",
      "openSync",
      "open",
      "readSync",
      "writeSync",
      "readdirSync",
      "statSync",
      "existsSync",
    ] as const;
    // Build the findings first: analysis may legitimately load the WASM grammar from disk.
    const prepared = await fc.sample(uncaughtCaseArb, 25).reduce<
      Promise<Array<{ c: UncaughtCase; finding: SecurityScanResult }>>
    >(async (accP, c) => {
      const acc = await accP;
      const finding = await uncaughtFindingFor(c.source, FILE_PATH, c.functionName);
      if (finding !== null) acc.push({ c, finding });
      return acc;
    }, Promise.resolve([]));
    expect(prepared.length).toBeGreaterThan(0);
    const spies = names.map((n) =>
      jest.spyOn(fs, n as "readFileSync").mockImplementation(() => {
        throw new Error(`file system access: ${n}`);
      })
    );
    try {
      fc.assert(
        fc.property(
          fc.constantFrom(...prepared),
          fc.constantFrom(...BOTH_FORMS),
          ({ c, finding }, options) => {
            expect(plan(finding, c.source, options)).not.toBeNull();
          }
        ),
        { numRuns: NUM_RUNS }
      );
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract-level properties (task 4.1): Properties 1 to 4, 13 to 15, and real findings
// ─────────────────────────────────────────────────────────────────────────────

/** A source file together with the findings the engine itself produced for it. */
interface AnalyzedInput {
  readonly filePath: string;
  readonly source: string;
  readonly findings: readonly SecurityScanResult[];
}

async function analyzeWithFindings(source: string, filePath: string): Promise<AnalyzedInput> {
  const parsed = await engine.parseSourceFiles({
    filePaths: [],
    virtualFiles: [{ filePath, sourceText: source }],
    includeSourceText: true,
  });
  const findings = await engine.runSecurityScan(parsed.files);
  return { filePath, source, findings };
}

/** Syntax diagnostics from the TypeScript parser, independent of the engine. */
function syntaxErrorCount(source: string): number {
  const out = ts.transpileModule(source, { reportDiagnostics: true, fileName: "x.ts" });
  return out.diagnostics?.length ?? 0;
}

const UNSUPPORTED = [
  "VULNERABILITY",
  "CODE_SMELL",
  "SECRET_LEAK",
  "DEPENDENCY_RISK",
  "PROTOTYPE_POLLUTION",
  "INJECTION",
  "AUTH_BYPASS",
] as const;

const optionsArb: fc.Arbitrary<OptionsArg> = fc.constantFrom(...BOTH_FORMS);

/** Synthetic source: unused-variable shapes or uncaught-exception shapes. */
const syntheticSourceArb: fc.Arbitrary<string> = fc.oneof(
  unusedCaseArb.map((c) => c.source),
  uncaughtCaseArb.map((c) => c.source)
);

let sampleInputs: AnalyzedInput[] = [];

beforeAll(async () => {
  const sample = engine.getSampleRepository();
  const parsed = await engine.parseSourceFiles({
    filePaths: [],
    virtualFiles: sample.files,
    includeSourceText: true,
  });
  const findings = await engine.runSecurityScan(parsed.files);
  sampleInputs = parsed.files.map((f) => ({
    filePath: f.filePath,
    source: f.sourceText,
    findings: findings.filter((x) => x.filePath === f.filePath),
  }));
});

/** Runs `body` over real engine findings of both input kinds. */
async function forEachInput(
  runs: number,
  body: (input: AnalyzedInput, finding: SecurityScanResult, options: OptionsArg) => Promise<void> | void,
  filter: (f: SecurityScanResult) => boolean = () => true
): Promise<void> {
  // Synthetic inputs: each run analyses a freshly generated source.
  await fc.assert(
    fc.asyncProperty(syntheticSourceArb, optionsArb, async (source, options) => {
      const input = await analyzeWithFindings(source, FILE_PATH);
      for (const f of input.findings.filter(filter)) await body(input, f, options);
    }),
    { numRuns: runs }
  );
  // Sample-repository inputs: any finding from any file.
  const pool = sampleInputs.flatMap((input) => input.findings.filter(filter).map((f) => ({ input, f })));
  expect(pool.length).toBeGreaterThan(0);
  await fc.assert(
    fc.asyncProperty(fc.constantFrom(...pool), optionsArb, async ({ input, f }, options) => {
      await body(input, f, options);
    }),
    { numRuns: runs }
  );
}

function isSupported(f: SecurityScanResult): boolean {
  return f.category === "UNUSED_VARIABLE" || f.category === "UNCAUGHT_EXCEPTION";
}

describe("remediation PBT: contract", () => {
  // Feature: deterministic-remediation, Property 1: Supported-category dispatch returns a shape, not a throw
  // **Validates: Requirements 1.1, 1.3, 1.4**
  it("Property 1: supported categories return null or a well-formed MutationRequest", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        const result = plan(finding, input.source, options);
        if (result === null) return;
        expect(Array.isArray(result.splices)).toBe(true);
        expect(result.splices.length).toBeGreaterThan(0);
        for (const s of result.splices) {
          expect(typeof s.filePath).toBe("string");
          expect(Number.isInteger(s.startIndex)).toBe(true);
          expect(Number.isInteger(s.endIndex)).toBe(true);
          expect(typeof s.replacement).toBe("string");
          expect(typeof s.description).toBe("string");
        }
      },
      isSupported
    );
  });

  // Feature: deterministic-remediation, Property 2: Unsupported categories always yield null
  // **Validates: Requirements 1.6**
  it("Property 2: any other category yields null", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        for (const category of UNSUPPORTED) {
          expect(plan({ ...finding, category }, input.source, options)).toBeNull();
        }
      },
      () => true
    );
  });

  // Feature: deterministic-remediation, Property 3: Determinism
  // **Validates: Requirements 1.5, 1.8, 1.9, 1.11**
  it("Property 3: equal inputs give deeply equal results, for errorCause true, false and omitted", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        const first = plan(finding, input.source, options);
        const second = plan(finding, input.source, options);
        expect(second).toEqual(first);
        // A call without options equals a call with { errorCause: false }.
        expect(plan(finding, input.source, undefined)).toEqual(plan(finding, input.source, { errorCause: false }));
      },
      isSupported
    );
  });

  // Feature: deterministic-remediation, Property 4: Unresolvable target yields null
  // **Validates: Requirements 1.7**
  it("Property 4: a range outside every function, or source without the function, yields null", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        const n = input.source.length;
        const outside = {
          ...finding,
          functionId: null,
          range: { ...finding.range, startIndex: n + 5, endIndex: n + 9 },
        };
        expect(plan(outside, input.source, options)).toBeNull();
        // The same finding against empty source has no target either.
        expect(plan({ ...finding, functionId: null }, "", options)).toBeNull();
      },
      isSupported
    );
  });

  // Feature: deterministic-remediation, Property 13: Splices are non-overlapping and in-bounds
  // **Validates: Requirements 4.1, 4.2, 4.3, 5.2**
  it("Property 13: every non-null plan has in-bounds, non-overlapping splices the Mutator accepts", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        const request = plan(finding, input.source, options);
        if (request === null) return;
        assertSplicesSane(request, input.source);
        expect(() => mutator.applyToString(input.source, request.splices)).not.toThrow();
        // At most one splice per line range, except the two insertions of an uncaught-exception plan.
        if (finding.category === "UNUSED_VARIABLE") {
          const lines = request.splices.map((s) => s.startIndex);
          expect(request.splices.length).toBeLessThanOrEqual(2);
          expect(new Set(lines).size).toBe(lines.length);
        } else {
          expect(request.splices.length).toBeGreaterThanOrEqual(2);
        }
      },
      isSupported
    );
  });

  // Feature: deterministic-remediation, Property 14: Round trip
  // **Validates: Requirements 4.4, 5.3**
  it("Property 14: apply then rollback restores the original source byte for byte", async () => {
    await forEachInput(
      NUM_RUNS,
      (input, finding, options) => {
        const request = plan(finding, input.source, options);
        if (request === null) return;
        const { mutated, rollbackRecord } = mutator.applyToString(input.source, request.splices);
        expect(mutator.rollbackString(mutated, rollbackRecord)).toBe(input.source);
      },
      isSupported
    );
  });

  // Feature: deterministic-remediation, Property 15: Applied result always parses
  // **Validates: Requirements 4.5, 5.4**
  it("Property 15: the source after applying a plan parses with zero syntax errors", async () => {
    await forEachInput(
      NUM_RUNS,
      async (input, finding, options) => {
        const request = plan(finding, input.source, options);
        if (request === null) return;
        const { mutated } = mutator.applyToString(input.source, request.splices);
        expect(syntaxErrorCount(mutated)).toBe(0);
        const after = await analyze(mutated, input.filePath);
        expect(after.errors).toBe(0);
      },
      isSupported
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Engine-produced UNUSED_VARIABLE findings. runSecurityScan reports the whole function's range,
// so the variable is identified only by the finding text: title `Unused variable: <name>` and
// description `Variable "<name>" is declared but never used in function "<fn>".`
// ─────────────────────────────────────────────────────────────────────────────

function variableOf(finding: SecurityScanResult): string {
  const prefix = "Unused variable: ";
  expect(finding.title.startsWith(prefix)).toBe(true);
  return finding.title.slice(prefix.length);
}

describe("remediation PBT: real engine findings", () => {
  // Feature: deterministic-remediation, Property 5: Unused-variable removal eliminates the finding on re-analysis
  // **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 5.5**
  it("a real UNUSED_VARIABLE finding resolves to its variable and disappears on re-scan (synthetic)", async () => {
    await fc.assert(
      fc.asyncProperty(unusedCaseArb, optionsArb, async (c, options) => {
        const input = await analyzeWithFindings(c.source, FILE_PATH);
        const unused = input.findings.filter((f) => f.category === "UNUSED_VARIABLE");
        expect(unused.map(variableOf)).toEqual([c.target]);
        const finding = unused[0]!;
        // The finding spans the function, not the variable.
        expect(finding.range.endIndex - finding.range.startIndex).toBeGreaterThan(c.target.length);

        const request = plan(finding, c.source, options);
        expect(request).not.toBeNull();
        assertSplicesSane(request!, c.source);
        const mutated = apply(c.source, request!);

        const names = declaredNames(mutated);
        expect(names).not.toContain(c.target);
        for (const s of c.siblings) expect(names).toContain(s);

        const again = await analyzeWithFindings(mutated, FILE_PATH);
        expect(again.findings.filter((f) => f.category === "UNUSED_VARIABLE")).toEqual([]);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  // Feature: deterministic-remediation, Property 5: Unused-variable removal eliminates the finding on re-analysis
  // **Validates: Requirements 2.1, 2.2, 2.4, 5.5, 5.7**
  it("a real UNUSED_VARIABLE finding resolves to its variable (sample repository)", async () => {
    const pool = sampleInputs.flatMap((input) =>
      input.findings.filter((f) => f.category === "UNUSED_VARIABLE").map((f) => ({ input, f }))
    );
    expect(pool.length).toBeGreaterThan(0);
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...pool), async ({ input, f }) => {
        const name = variableOf(f);
        const request = engine.planRemediation(f, input.source);
        expect(request).not.toBeNull();
        assertSplicesSane(request!, input.source);
        const mutated = apply(input.source, request!);
        const again = await analyzeWithFindings(mutated, input.filePath);
        const remaining = again.findings.filter(
          (x) => x.category === "UNUSED_VARIABLE" && x.functionId === f.functionId && variableOf(x) === name
        );
        expect(remaining).toEqual([]);
        expect(syntaxErrorCount(mutated)).toBe(0);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});
