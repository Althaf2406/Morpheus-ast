/**
 * tests/pbt/topology.exceptions.test.ts
 *
 * The uncaught-exception rule (risky operation outside try/catch, propagated through the call
 * graph) and the readable function names, exercised through the real engine pipeline.
 */
import * as fc from "fast-check";
import { createEngine } from "../../src/index.js";
import type { FunctionNode, TopologyGraph, VirtualFile } from "../../src/contracts.js";

const engine = createEngine();

async function graphOf(files: readonly VirtualFile[]): Promise<TopologyGraph> {
  const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: files, includeSourceText: true });
  return engine.buildTopologyGraph(parsed.files);
}
async function single(source: string, filePath = "a.ts"): Promise<TopologyGraph> {
  return graphOf([{ filePath, sourceText: source }]);
}
function byName(graph: TopologyGraph, name: string): FunctionNode {
  const fn = graph.functions.find((f) => f.name === name);
  if (fn === undefined) throw new Error(`no function ${name}; have ${graph.functions.map((f) => f.name).join(" | ")}`);
  return fn;
}

describe("uncaught exception rule", () => {
  it.each([
    ["throw", "function f(x: number) { if (x) { throw new Error('x'); } }", "throws"],
    ["await", "async function f() { await Promise.resolve(1); }", "awaits without try/catch"],
    ["for await", "async function f(s: AsyncIterable<number>) { for await (const v of s) { void v; } }", "awaits without try/catch"],
    ["JSON.parse", "function f(s: string) { return JSON.parse(s); }", "calls JSON.parse"],
    ["fetch", "function f() { return fetch('/x'); }", "calls fetch"],
    ["require", "function f() { return require('x'); }", "calls require"],
    ["new URL", "function f(s: string) { return new URL(s); }", "calls new URL"],
    ["decodeURIComponent", "function f(s: string) { return decodeURIComponent(s); }", "calls decodeURIComponent"],
    ["encodeURIComponent", "function f(s: string) { return encodeURIComponent(s); }", "calls encodeURIComponent"],
    ["structuredClone", "function f(s: object) { return structuredClone(s); }", "calls structuredClone"],
    ["fs.readFileSync", "import fs from 'fs';\nfunction f() { return fs.readFileSync('a'); }", "calls fs.readFileSync"],
    ["fs.promises.writeFile", "import fs from 'node:fs';\nfunction f() { return fs.promises.writeFile('a', 'b'); }", "calls fs.promises.writeFile"],
    ["named fs import", "import { mkdir } from 'fs/promises';\nfunction f() { return mkdir('a'); }", "calls mkdir"],
    ["require('fs')", "const fs = require('fs');\nfunction f() { fs.unlink('a', () => undefined); }", "calls fs.unlink"],
  ])("flags %s", async (_label, source, reason) => {
    const g = await single(source);
    const fn = byName(g, "f");
    expect(fn.hasUncaughtException).toBe(true);
    expect(fn.uncaughtReasons).toContain(reason);
  });

  it.each([
    ["plain call", "function g() { return 1; }\nfunction f() { return g(); }"],
    ["unknown call", "function f(x: number[]) { return helper(x); }"],
    ["array methods", "function f(x: number[]) { return x.map((n) => n + 1).filter(Boolean).reduce((a, b) => a + b, 0); }"],
    ["logging", "function f(x: number) { console.log(x); console.error('e'); }"],
    ["arithmetic", "function f(a: number, b: number) { return (a * b) / (a - b) + a % b; }"],
    ["property call on non-fs object", "function f(o: { readFile(): void }) { o.readFile(); }"],
    ["local function named fetch", "function fetch() { return 1; }\nfunction f() { return fetch(); }"],
  ])("does not flag %s", async (_label, source) => {
    const g = await single(source);
    expect(byName(g, "f").hasUncaughtException).toBe(false);
    expect(byName(g, "f").uncaughtReasons).toEqual([]);
  });

  it("does not flag risky operations inside a try block with catch, or inside its catch clause", async () => {
    const g = await single(
      "async function f(s: string) {\n  try { await Promise.resolve(JSON.parse(s)); throw new Error('x'); } catch (e) { throw e; }\n}"
    );
    expect(byName(g, "f").hasUncaughtException).toBe(false);
  });

  it("still flags risky operations in finally and in try/finally without catch", async () => {
    const g = await single(
      "async function f() { try { await 1; } finally { await 2; } }\nasync function h() { try { return 1; } catch (e) { return 2; } finally { await 3; } }"
    );
    expect(byName(g, "f").hasUncaughtException).toBe(true);
    expect(byName(g, "h").hasUncaughtException).toBe(true);
  });

  it("does not attribute a nested function's risky operation to the outer function", async () => {
    const g = await single("function outer(items: string[]) { return items.map((s) => JSON.parse(s)); }");
    expect(byName(g, "outer").hasUncaughtException).toBe(false);
    expect(byName(g, "callback passed to items.map").hasUncaughtException).toBe(true);
  });

  it("propagates through calls, across files, and names the callee", async () => {
    const g = await graphOf([
      { filePath: "a.ts", sourceText: "import { handleX } from './b';\nexport function route() { return handleX(); }\nfunction top() { return route(); }" },
      { filePath: "b.ts", sourceText: "export function handleX() { throw new Error('x'); }" },
    ]);
    expect(byName(g, "handleX").uncaughtReasons).toEqual(["throws"]);
    expect(byName(g, "route").uncaughtReasons).toEqual(["calls handleX which can throw"]);
    expect(byName(g, "top").uncaughtReasons).toEqual(["calls route which can throw"]);
  });

  it("does not propagate from a call that sits inside a try block", async () => {
    const g = await single("function bad() { throw new Error('x'); }\nfunction f() { try { bad(); } catch (e) { return 1; } return 2; }");
    expect(byName(g, "f").hasUncaughtException).toBe(false);
  });

  it("terminates on cycles and flags the whole cycle when one member is risky", async () => {
    const g = await single(
      "function a() { return b(); }\nfunction b() { return c(); }\nfunction c() { if (Math.random() > 2) { throw new Error('x'); } return a(); }\nfunction p() { return q(); }\nfunction q() { return p(); }"
    );
    for (const n of ["a", "b", "c"]) expect(byName(g, n).hasUncaughtException).toBe(true);
    for (const n of ["p", "q"]) expect(byName(g, n).hasUncaughtException).toBe(false);
  });

  it("is deterministic: same input, same flags and reasons", async () => {
    const source = "async function a() { await b(); }\nfunction b() { return JSON.parse('1'); }\nfunction c() { return a(); }";
    const first = (await single(source)).functions.map((f) => [f.id, f.hasUncaughtException, f.uncaughtReasons]);
    const second = (await single(source)).functions.map((f) => [f.id, f.hasUncaughtException, f.uncaughtReasons]);
    expect(second).toEqual(first);
  });

  it("property: a function made only of plain calls and arithmetic is never flagged", async () => {
    const stmt = fc.constantFrom("g(p);", "console.log(p);", "p.map((x) => x);", "const v = p + 1;", "[1, 2].forEach(g);");
    await fc.assert(
      fc.asyncProperty(fc.array(stmt, { minLength: 1, maxLength: 6 }), async (stmts) => {
        const g = await single(`function g(x: unknown) { return x; }\nfunction f(p: any) {\n${stmts.join("\n")}\n}`);
        expect(byName(g, "f").hasUncaughtException).toBe(false);
      }),
      { numRuns: 30 }
    );
  });

  it("p-limit style code: only the async function and its callers are flagged", async () => {
    const source = [
      "export default function pLimit(concurrency: number) {",
      "  const queue: Array<() => void> = [];",
      "  let activeCount = 0;",
      "  const next = () => {",
      "    activeCount--;",
      "    if (queue.length > 0) { queue.shift()!(); }",
      "  };",
      "  const run = async (function_: () => unknown, resolve: (v: unknown) => void, args: unknown[]) => {",
      "    activeCount++;",
      "    const result = (async () => function_(...args))();",
      "    resolve(result);",
      "    try { await result; } catch {}",
      "    next();",
      "  };",
      "  const enqueue = (function_: () => unknown, resolve: (v: unknown) => void, args: unknown[]) => {",
      "    new Promise<void>((internalResolve) => { queue.push(internalResolve); }).then(run.bind(undefined, function_, resolve, args));",
      "    (async () => { await Promise.resolve(); if (activeCount < concurrency && queue.length > 0) { queue.shift()!(); } })();",
      "  };",
      "  const generator = (function_: () => unknown, ...args: unknown[]) => new Promise((resolve) => { enqueue(function_, resolve, args); });",
      "  Object.defineProperties(generator, { activeCount: { get: () => activeCount }, clearQueue: { value() { queue.length = 0; } } });",
      "  return generator;",
      "}",
    ].join("\n");
    const g = await single(source, "index.ts");
    const report = g.functions.map((f) => `${f.name}: ${f.hasUncaughtException ? (f.uncaughtReasons ?? []).join(", ") : "ok"}`);
    // eslint-disable-next-line no-console
    console.log(`p-limit style analysis:\n${report.join("\n")}`);
    const flagged = g.functions.filter((f) => f.hasUncaughtException).map((f) => f.name);
    expect(g.functions.length).toBeGreaterThanOrEqual(8);
    expect(flagged.length).toBeLessThan(g.functions.length / 2);
    expect(byName(g, "next").hasUncaughtException).toBe(false);
    expect(byName(g, "generator").hasUncaughtException).toBe(false);
    expect(byName(g, "run").hasUncaughtException).toBe(false); // await sits inside try/catch
  });

  it("p-limit style: an async function with await outside try is flagged with its reason", async () => {
    const g = await single(
      "export function limit() {\n  const run = async (fn: () => unknown) => {\n    const result = await fn();\n    return result;\n  };\n  return [1, 2].map((n) => n + 1).filter(() => true).concat(run as never);\n}"
    );
    expect(byName(g, "run").uncaughtReasons).toEqual(["awaits without try/catch"]);
    expect(byName(g, "callback passed to map").hasUncaughtException).toBe(false);
  });
});

describe("readable function names", () => {
  async function names(source: string, filePath = "a.ts"): Promise<string[]> {
    return (await single(source, filePath)).functions.map((f) => f.name);
  }

  it("uses declared names, variable names, properties, class members and assignment targets", async () => {
    const n = await names(
      [
        "function decl() {}",
        "const arrow = () => {};",
        "const expr = function () {};",
        "const obj = { prop: () => {}, 'quoted-key': function () {}, method() {} };",
        "class K { member = () => {}; run() {} }",
        "module.exports = function () {};",
        "exports.helper = () => {};",
        "let late; late = () => {};",
      ].join("\n")
    );
    expect(n).toEqual(["decl", "arrow", "expr", "prop", "quoted-key", "method", "member", "run", "module.exports", "helper", "late"]);
  });

  it("names export default", async () => {
    expect(await names("export default function () {}")).toEqual(["default export"]);
    expect(await names("export default () => {};")).toEqual(["default export"]);
  });

  it("names inline callbacks after the callee or the enclosing function", async () => {
    const n = await names(
      "function setup(items: number[]) {\n  items.map((x) => x);\n  app.use(function () {});\n  new Promise((r) => r(1));\n  return () => 1;\n}\nsetTimeout(() => {}, 1);"
    );
    expect(n).toEqual([
      "setup",
      "callback passed to items.map",
      "callback passed to app.use",
      "callback passed to Promise",
      "callback in setup",
      "callback passed to setTimeout",
    ]);
  });

  it("falls back to anonymous (line N) with a 1-based line, never an offset", async () => {
    const n = await names("\n\n(function () {})();\n(() => {})();");
    expect(n).toEqual(["anonymous (line 3)", "anonymous (line 4)"]);
  });

  it("keeps names unique within a file when callbacks repeat", async () => {
    const n = await names("a.map((x) => x);\nb.then(() => 1);\na.map((y) => y);\na.map((z) => z); a.map((w) => w);");
    expect(new Set(n).size).toBe(n.length);
    expect(n).toContain("callback passed to b.then");
    expect(n).toContain("callback passed to a.map (line 1)");
    expect(n).toContain("callback passed to a.map (line 4)");
    expect(n).toContain("callback passed to a.map (line 4) #2");
  });

  it("never contains an offset-style name, and is stable across parses", async () => {
    const source = "const q = [];\nq.push(() => 1);\n(function () { return () => 2; })();\nexport default () => 3;";
    const first = await names(source);
    const second = await names(source);
    expect(second).toEqual(first);
    for (const name of first) expect(name).not.toMatch(/<anonymous|:\d+>/);
  });

  it("keeps names and function ids identical after apply followed by rollback", async () => {
    const source = "async function run() {\n  const r = await work();\n  [1].forEach((x) => x);\n  return r;\n}\nasync function work() { return 1; }\n";
    const before = await single(source);
    const finding = (await engine.runSecurityScan((await engine.parseSourceFiles({
      filePaths: [], virtualFiles: [{ filePath: "a.ts", sourceText: source }], includeSourceText: true,
    })).files)).find((f) => f.category === "UNCAUGHT_EXCEPTION");
    expect(finding).toBeDefined();
    const request = engine.planRemediation(finding!, source, { errorCause: true });
    expect(request).not.toBeNull();
    const applied = engine.applyMutationToText(source, request!.splices);
    const rolledBack = engine.rollbackMutationText(applied.mutatedSource, applied.rollbackRecord);
    expect(rolledBack).toBe(source);
    const after = await single(rolledBack);
    expect(after.functions.map((f) => [f.id, f.name])).toEqual(before.functions.map((f) => [f.id, f.name]));
  });
});
