/**
 * tests/pbt/remediation.unit.test.ts
 *
 * Concrete-example tests for planRemediation (deterministic-remediation, task 4.2).
 */
import * as ts from "typescript";
import { planRemediation } from "../../src/remediation/index.js";
import { SurgicalMutator } from "../../src/mutator/index.js";
import type {
  FindingCategory,
  RemediationOptions,
  SecurityScanResult,
} from "../../src/contracts.js";

const FILE = "sample.ts";

function makeFinding(
  category: FindingCategory,
  startIndex: number,
  endIndex: number
): SecurityScanResult {
  return {
    findingId: "f-1",
    severity: "LOW",
    category,
    title: "t",
    description: "d",
    filePath: FILE,
    range: {
      filePath: FILE,
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 0,
      startIndex,
      endIndex,
    },
    functionId: null,
    sourceScanner: "INTERNAL",
    cweId: null,
    cvssScore: null,
  };
}

/** Finding on the first occurrence of `name` as a declared variable. */
function unusedFinding(source: string, name: string): SecurityScanResult {
  const start = source.indexOf(name);
  return makeFinding("UNUSED_VARIABLE", start, start + name.length);
}

/** Finding anchored on the function whose header starts at `marker`. */
function uncaughtFinding(source: string, marker: string): SecurityScanResult {
  const start = source.indexOf(marker);
  return makeFinding("UNCAUGHT_EXCEPTION", start, start + marker.length);
}

function applyPlan(
  source: string,
  finding: SecurityScanResult,
  options?: RemediationOptions
): string {
  const plan = options === undefined
    ? planRemediation(finding, source)
    : planRemediation(finding, source, options);
  if (plan === null) throw new Error("expected a plan");
  return new SurgicalMutator().applyToString(source, plan.splices).mutated;
}

function parsesCleanly(text: string): boolean {
  const result = ts.transpileModule(text, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  return (result.diagnostics ?? []).length === 0;
}

const CAUSE_OPTIONS: RemediationOptions = { errorCause: true };
const PLAIN_OPTIONS: RemediationOptions = { errorCause: false };
/** Options object lacking the field; the single cast is documented here. */
const EMPTY_OPTIONS = {} as Partial<RemediationOptions> as RemediationOptions;

const FUNCTIONS: ReadonlyArray<{ label: string; name: string; source: string }> = [
  { label: "void", name: "run", source: "function run() {\n  doWork();\n}\n" },
  {
    label: "value-returning",
    name: "compute",
    source: "function compute(x: number): number {\n  return helper(x);\n}\n",
  },
  {
    label: "interface-typed-return",
    name: "load",
    source:
      "interface Row { id: number }\nfunction load(): Row {\n  return fetchRow();\n}\n",
  },
  {
    label: "async",
    name: "save",
    source: "async function save(): Promise<void> {\n  await store();\n}\n",
  },
];

describe("planRemediation: UNCAUGHT_EXCEPTION concrete examples", () => {
  for (const fn of FUNCTIONS) {
    describe(`${fn.label} function`, () => {
      const finding = uncaughtFinding(fn.source, `function ${fn.name}`);
      const catchEnd = (id: string): string => `\n} catch (${id}) {\n`;

      it("Cause_Form with { errorCause: true }", () => {
        const out = applyPlan(fn.source, finding, CAUSE_OPTIONS);
        expect(out).toContain("try {\n");
        expect(out).toContain(catchEnd("error"));
        expect(out).toContain(
          `throw new Error("${fn.name} failed", { cause: error });`
        );
        expect(out).not.toContain("return error");
        expect(parsesCleanly(out)).toBe(true);
      });

      it("adds no return inside the catch clause (Cause_Form)", () => {
        const out = applyPlan(fn.source, finding, CAUSE_OPTIONS);
        const catchPart = out.slice(out.indexOf("catch ("));
        expect(catchPart).not.toContain("return");
      });

      it("Plain_Form for { errorCause: false }, missing field and no third argument", () => {
        const expectedThrow = `throw new Error(\`${fn.name} failed: \${String(error)}\`);`;
        for (const options of [PLAIN_OPTIONS, EMPTY_OPTIONS, undefined]) {
          const out = applyPlan(fn.source, finding, options);
          expect(out).toContain(expectedThrow);
          expect(out).toContain(`${fn.name} failed: `);
          expect(out).not.toContain("cause");
          const catchPart = out.slice(out.indexOf("catch ("));
          expect(catchPart).not.toContain("return");
          expect(parsesCleanly(out)).toBe(true);
        }
      });

      it("a two-argument call equals a call with { errorCause: false }", () => {
        expect(planRemediation(finding, fn.source)).toEqual(
          planRemediation(finding, fn.source, PLAIN_OPTIONS)
        );
      });

      it("uses exactly two zero-width insertion splices", () => {
        const plan = planRemediation(finding, fn.source, CAUSE_OPTIONS);
        expect(plan).not.toBeNull();
        expect(plan?.splices).toHaveLength(2);
        for (const splice of plan?.splices ?? []) {
          expect(splice.startIndex).toBe(splice.endIndex);
        }
      });
    });
  }

  it("keeps the async modifier and wraps inside the same function", () => {
    const source = FUNCTIONS[3]!.source;
    const out = applyPlan(source, uncaughtFinding(source, "function save"), CAUSE_OPTIONS);
    expect(out).toContain("async function save(): Promise<void> {");
    expect(out.indexOf("try {")).toBeGreaterThan(out.indexOf("async function save"));
  });

  it("skips colliding identifier names: error, then error2", () => {
    const source = "function run(error: unknown) {\n  const error2 = 1;\n  doWork(error, error2);\n}\n";
    const out = applyPlan(source, uncaughtFinding(source, "function run"), CAUSE_OPTIONS);
    expect(out).toContain("catch (error3)");
    expect(out).toContain("{ cause: error3 }");

    const onlyError = "function run(error: unknown) {\n  doWork(error);\n}\n";
    const out2 = applyPlan(onlyError, uncaughtFinding(onlyError, "function run"), PLAIN_OPTIONS);
    expect(out2).toContain("catch (error2)");
    expect(out2).toContain("String(error2)");
  });

  it("returns null when the function body has no statements", () => {
    const source = "function empty() {\n}\n";
    expect(
      planRemediation(uncaughtFinding(source, "function empty"), source, CAUSE_OPTIONS)
    ).toBeNull();
  });
});

describe("planRemediation: null results", () => {
  it("unknown variable name gives null", () => {
    const source = "function run() {\n  const used = 1;\n  // missing\n  return used;\n}\n";
    expect(planRemediation(unusedFinding(source, "missing"), source)).toBeNull();
  });

  it("unsupported category gives null", () => {
    const source = "function run() {\n  doWork();\n}\n";
    const finding = makeFinding("VULNERABILITY", 0, 5);
    expect(planRemediation(finding, source)).toBeNull();
    expect(planRemediation(finding, source, CAUSE_OPTIONS)).toBeNull();
  });

  it("out-of-range range gives null", () => {
    const source = "function run() {\n  const x = 1;\n}\n";
    const unused = makeFinding("UNUSED_VARIABLE", 9999, 10005);
    const uncaught = makeFinding("UNCAUGHT_EXCEPTION", 9999, 10005);
    expect(planRemediation(unused, source)).toBeNull();
    expect(planRemediation(uncaught, source, CAUSE_OPTIONS)).toBeNull();
  });
});

describe("planRemediation: UNUSED_VARIABLE concrete examples", () => {
  it("removes a pure single declaration with its line", () => {
    const source = "function run() {\n  const x = 1;\n  return 2;\n}\n";
    const out = applyPlan(source, unusedFinding(source, "x"));
    expect(out).toBe("function run() {\n  return 2;\n}\n");
  });

  it("turns a side-effect initializer into an expression statement", () => {
    const source = "function run() {\n  const x = compute();\n  return 2;\n}\n";
    const out = applyPlan(source, unusedFinding(source, "x"));
    expect(out).toBe("function run() {\n  compute();\n  return 2;\n}\n");
  });

  describe("multi-declarator statement", () => {
    const source = "function run() {\n  const a = 1, b = 2, c = 3;\n  return a + c;\n}\n";

    it("removes the first declarator", () => {
      const start = source.indexOf("a = 1");
      const finding = makeFinding("UNUSED_VARIABLE", start, start + 1);
      expect(applyPlan(source, finding)).toBe(
        "function run() {\n  const b = 2, c = 3;\n  return a + c;\n}\n"
      );
    });

    it("removes the middle declarator", () => {
      const start = source.indexOf("b = 2");
      const finding = makeFinding("UNUSED_VARIABLE", start, start + 1);
      expect(applyPlan(source, finding)).toBe(
        "function run() {\n  const a = 1, c = 3;\n  return a + c;\n}\n"
      );
    });

    it("removes the last declarator", () => {
      const start = source.indexOf("c = 3");
      const finding = makeFinding("UNUSED_VARIABLE", start, start + 1);
      expect(applyPlan(source, finding)).toBe(
        "function run() {\n  const a = 1, b = 2;\n  return a + c;\n}\n"
      );
    });
  });

  it("keeps a side-effect initializer of a removed declarator as a statement", () => {
    const source = "function run() {\n  const a = 1, b = make();\n  return a;\n}\n";
    const start = source.indexOf("b = make");
    const finding = makeFinding("UNUSED_VARIABLE", start, start + 1);
    const out = applyPlan(source, finding);
    expect(out).toBe("function run() {\n  const a = 1;\n  make();\n  return a;\n}\n");
  });
});
