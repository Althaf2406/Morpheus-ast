#!/usr/bin/env node
/**
 * scripts/verify-adapters.mjs
 *
 * Compiles the core and both app adapters (strict mode) into throwaway folders, then runs
 * scripts/adapter-checks.cjs, which drives the real adapters against the real engine:
 * sample loading, in-memory and on-disk spells, rollback, bugfix.md export, scanner
 * ingestion, and what the AI advisor is sent. Run it after changing contracts.ts or an adapter.
 *
 *   pnpm run verify:adapters
 *
 * Build output goes to .tmp-build/ and packages/morpheus-ast-core/.tmp-build/ (both git-ignored)
 * and is removed afterwards.
 */

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = join(root, "packages", "morpheus-ast-core");
const tsc = join(core, "node_modules", "typescript", "bin", "tsc");
const temp = [join(root, ".tmp-build"), join(core, ".tmp-build")];

function run(label, command, args, cwd) {
  console.log(`> ${label}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`FAILED: ${label} (exit ${result.status})`);
    process.exitCode = result.status ?? 1;
    return false;
  }
  return true;
}

try {
  const ok =
    run("compile core", process.execPath, [tsc, "-p", "tsconfig.json", "--outDir", ".tmp-build"], core) &&
    run(
      "compile both adapters (strict)",
      process.execPath,
      [
        tsc, "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node", "--lib", "ES2022",
        "--strict", "--esModuleInterop", "--skipLibCheck", "--rootDir", ".", "--outDir", ".tmp-build/apps",
        "apps/infrashield-chaos/src/adapter.ts", "apps/necro-compiler-game/src/adapter.ts",
      ],
      root
    ) &&
    run("run adapter checks", process.execPath, [join(root, "scripts", "adapter-checks.cjs")], root);

  if (ok) console.log("verify:adapters OK");
} finally {
  for (const dir of temp) rmSync(dir, { recursive: true, force: true });
}
