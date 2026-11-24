#!/usr/bin/env node
/**
 * scripts/verify-dist.mjs
 *
 * Builds morpheus-ast-core with its real build script and checks the published surface:
 *   1. dist/ layout: dist/index.js exists, no tests or src/ folder inside dist/
 *   2. runtime: `morpheus-ast-core` and `morpheus-ast-core/tree-sitter` resolve through the
 *      package.json "exports" map; an unexported deep import is blocked; the default entry does
 *      not load web-tree-sitter or the AWS SDK
 *   3. types: a consumer resolves both entry points under TypeScript "node16" and classic "node"
 *
 *   pnpm run verify:dist
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(root, "packages", "morpheus-ast-core");
const dist = join(core, "dist");
const tsc = join(core, "node_modules", "typescript", "bin", "tsc");
const runtimeFile = join(core, ".tmp-runtime-check.cjs");
const consumer = join(core, ".tmp-consumer");
const link = join(consumer, "node_modules", "morpheus-ast-core");

let failed = false;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failed = true;
};
const pass = (message) => console.log(`PASS ${message}`);

function run(label, command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: options.shell ?? false });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    fail(`${label} (exit ${result.status})${output ? `\n${output}` : ""}`);
    return null;
  }
  return output;
}

const RUNTIME_CHECK = `
const assert = require("node:assert/strict");
const main = require("morpheus-ast-core");
assert.equal(typeof main.createEngine, "function");
const loaded = Object.keys(require.cache);
assert.ok(!loaded.some((k) => k.includes("web-tree-sitter")), "default entry loaded web-tree-sitter");
assert.ok(!loaded.some((k) => k.includes("client-bedrock-runtime")), "default entry loaded the AWS SDK");
console.log("default entry: createEngine present; web-tree-sitter and AWS SDK not loaded");

(async () => {
  const engine = main.createEngine();
  const sample = engine.getSampleRepository();
  const parsed = await engine.parseSourceFiles({ filePaths: [], virtualFiles: sample.files, includeSourceText: true });
  const graph = await engine.buildTopologyGraph(parsed.files);
  assert.ok(graph.functions.length >= 12 && graph.circularDepCount >= 1);
  const target = graph.functions.find((f) => f.name === "handleGetUsers");
  const fault = await engine.injectFault({ targetFunctionId: target.id, faultType: "UNCAUGHT_EXCEPTION" }, graph);
  assert.ok(engine.generateBugfixMarkdown(engine.generateBugfixSpec(fault, graph)).includes("## Current Behavior (Defect)"));
  assert.equal(engine.ingestExternalFindings({ snyk: [{ id: "s", severity: "high", title: "t", description: "d", packageName: "p" }] }, graph).length, 1);
  console.log("engine from dist: " + graph.functions.length + " functions, bugfix markdown and scanner ingestion work");

  const ts = require("morpheus-ast-core/tree-sitter");
  const parser = await ts.TreeSitterParser.create(require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm"));
  const ok = parser.analyze("const a: number = 1;");
  assert.ok(ok.nodeCount > 0 && ok.hasErrors === false);
  assert.ok(parser.analyze("const = ;").hasErrors === true);
  parser.dispose();
  console.log("tree-sitter entry from dist: parsed " + ok.nodeCount + " nodes");

  assert.throws(() => require("morpheus-ast-core/dist/parser/index.js"), (e) => e.code === "ERR_PACKAGE_PATH_NOT_EXPORTED");
  console.log("deep import of an unexported file is blocked");
})().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
`;

const CONSUMER = `
import { createEngine } from "morpheus-ast-core";
import type { MorpheusASTEngine, ExternalScanReport, SecurityScanResult } from "morpheus-ast-core";
import { TreeSitterParser } from "morpheus-ast-core/tree-sitter";

export const engine: MorpheusASTEngine = createEngine();
export const report: ExternalScanReport = { snyk: [] };
export const findings: readonly SecurityScanResult[] = engine.ingestExternalFindings(report, {
  modules: [], functions: [], edges: [], totalComplexity: 0, circularDepCount: 0, durationMs: 0,
});
export const parser: Promise<TreeSitterParser> = TreeSitterParser.create("grammar.wasm");
`;

try {
  // 1. real build
  if (run("pnpm build", "pnpm", ["--filter", "morpheus-ast-core", "run", "build"], root, { shell: true }) !== null) {
    pass("pnpm --filter morpheus-ast-core run build");
  }

  // 2. layout
  for (const file of ["index.js", "index.d.ts", "contracts.d.ts", join("parser", "tree-sitter.js"), join("parser", "tree-sitter.d.ts")]) {
    existsSync(join(dist, file)) ? pass(`dist/${file} exists`) : fail(`dist/${file} is missing`);
  }
  existsSync(join(dist, "tests")) || existsSync(join(dist, "src"))
    ? fail("dist/ contains tests/ or src/ (build config includes the wrong files)")
    : pass("dist/ has no tests/ or src/ folder");

  // 3. runtime resolution through the exports map
  writeFileSync(runtimeFile, RUNTIME_CHECK);
  const runtime = run("runtime resolution", process.execPath, [runtimeFile], core);
  if (runtime !== null) for (const line of runtime.split(/\r?\n/)) pass(line);

  // 4. type resolution for a consumer
  mkdirSync(join(consumer, "node_modules"), { recursive: true });
  symlinkSync(core, link, "junction");
  writeFileSync(join(consumer, "consumer.ts"), CONSUMER);
  for (const [name, module, moduleResolution] of [["node16", "node16", "node16"], ["classic node", "CommonJS", "node"]]) {
    const config = join(consumer, `tsconfig.${module}.json`);
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: { module, moduleResolution, target: "ES2022", strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, types: [] },
        files: ["consumer.ts"],
      })
    );
    if (run(`types under ${name} resolution`, process.execPath, [tsc, "-p", config], consumer) !== null) {
      pass(`types resolve under ${name} resolution`);
    }
  }
} finally {
  try { unlinkSync(link); } catch { /* link was never created */ }
  rmSync(consumer, { recursive: true, force: true });
  rmSync(runtimeFile, { force: true });
}

if (failed) {
  console.error("verify:dist FAILED");
  process.exit(1);
}
console.log("verify:dist OK");
