#!/usr/bin/env node
/**
 * scripts/check-boundaries.mjs
 *
 * Enforces .kiro/steering/00-skeleton-isolation.md:
 *   R1. packages/morpheus-ast-core must never import from apps/.
 *   R2. packages/morpheus-ast-core/package.json must not depend on UI frameworks.
 *   R3. apps/* may import from morpheus-ast-core only via src/contracts. The single exception is
 *       apps/<app>/src/adapter.ts (the composition root), which may also import src/index to call
 *       createEngine(). UI files import only from ./adapter.
 *   R4. packages/morpheus-ast-core must not contain the TypeScript `any` type.
 *   R5. packages/morpheus-ast-core (src and tests) must not use application vocabulary.
 *
 * Plain Node, no dependencies. Exit code 1 on any violation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "packages", "morpheus-ast-core");
const appsDir = join(root, "apps");

const UI_PACKAGES = ["react", "react-dom", "three", "@react-three/fiber", "@react-three/drei", "vue", "svelte"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
// Vocabulary that belongs to the applications, never to the headless core (comments included).
const DOMAIN_WORDS =
  /\b(dungeons?|spells?|monsters?|lambdas?|serverless|sre|chaos|necro|poltergeists?|demons?|zombies?|ghosts?|curses?|boss)\b/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** Returns import/export-from/require/dynamic-import specifiers with line numbers. */
function specifiers(source) {
  const found = [];
  const re = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
  source.split(/\r?\n/).forEach((line, i) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) found.push({ spec: m[1], line: i + 1 });
  });
  return found;
}

/** Strips comments and string/template contents so `any` is only matched in code. */
function stripNonCode(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

const violations = [];
const rel = (f) => relative(root, f).replaceAll("\\", "/");

// R1 + R4: core sources
for (const file of walk(join(coreDir, "src")).concat(walk(join(coreDir, "tests")))) {
  const src = readFileSync(file, "utf8");
  for (const { spec, line } of specifiers(src)) {
    const resolved = spec.startsWith(".") ? resolve(dirname(file), spec) : null;
    const hitsApps = /(^|[\\/])apps([\\/]|$)/.test(spec) || (resolved !== null && resolved.startsWith(appsDir));
    if (hitsApps) violations.push(`R1 ${rel(file)}:${line} core imports from apps/ ("${spec}")`);
  }
  src.split(/\r?\n/).forEach((line, i) => {
    const hit = DOMAIN_WORDS.exec(line);
    if (hit) violations.push(`R5 ${rel(file)}:${i + 1} domain vocabulary in core ("${hit[0]}")`);
  });
  if (!rel(file).includes("/sample-repo/")) {
    stripNonCode(src).split(/\r?\n/).forEach((line, i) => {
      if (/(:\s*any\b|<any>|\bas\s+any\b|\bany\[\]|Array<any>)/.test(line)) {
        violations.push(`R4 ${rel(file)}:${i + 1} uses the \`any\` type`);
      }
    });
  }
}

// R2: core package.json
const corePkg = JSON.parse(readFileSync(join(coreDir, "package.json"), "utf8"));
for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
  for (const dep of Object.keys(corePkg[section] ?? {})) {
    if (UI_PACKAGES.includes(dep)) violations.push(`R2 packages/morpheus-ast-core/package.json ${section} contains UI package "${dep}"`);
  }
}

// R3: apps import core only via contracts; adapter.ts (composition root) may also import src/index
const CONTRACTS_RE = /\/src\/contracts(\.js|\.ts)?$|^morpheus-ast-core\/contracts$/;
const INDEX_RE = /\/src\/index(\.js|\.ts)?$/;
for (const file of walk(appsDir)) {
  const src = readFileSync(file, "utf8");
  const isAdapter = /^apps\/[^/]+\/src\/adapter\.ts$/.test(rel(file));
  for (const { spec, line } of specifiers(src)) {
    if (!/morpheus-ast-core/.test(spec)) continue;
    if (CONTRACTS_RE.test(spec)) continue;
    if (isAdapter && INDEX_RE.test(spec)) continue;
    violations.push(`R3 ${rel(file)}:${line} app imports a non-contract core path ("${spec}")`);
  }
}
if (violations.length > 0) {
  console.error(`lint:boundaries FAILED (${violations.length} violation${violations.length === 1 ? "" : "s"}):`);
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log("lint:boundaries OK: no boundary violations.");
