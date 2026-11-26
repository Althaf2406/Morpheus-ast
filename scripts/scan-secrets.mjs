#!/usr/bin/env node
/**
 * scripts/scan-secrets.mjs
 *
 * Pre-commit / session-end secret scanner used by
 * .kiro/hooks/security-precommit-scanner.json (trigger: "Stop").
 *
 * Scans every file git considers changed: staged, modified, AND untracked
 * (excluding ignored files). Prints file:line and the finding type only; the
 * matched text is never printed. Exit code 1 when anything is found.
 *
 * Usage: node scripts/scan-secrets.mjs [--all]   (--all scans every tracked file too)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 1_000_000;
const SKIP_NAMES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".wasm", ".exe", ".zip", ".ico"]);

const RULES = [
  { type: "API_KEY (AWS access key id)", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { type: "API_KEY (AWS secret key)", re: /aws_?secret_?access_?key["']?\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/i },
  { type: "API_KEY (sk- style)", re: /\bsk-[A-Za-z0-9_-]{32,}\b/ },
  { type: "TOKEN (GitHub)", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { type: "TOKEN (Slack)", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { type: "TOKEN (bearer header)", re: /Authorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+/-]{20,}/i },
  { type: "API_KEY (ElevenLabs)", re: /xi[-_]api[-_]key["']?\s*[:=]\s*["'][A-Za-z0-9]{24,}["']/i },
  { type: "PRIVATE_KEY", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { type: "PASSWORD (literal assignment)", re: /\b(?:password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { type: "CREDENTIAL_URL", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@"']+:[^\s/@"']+@[^\s"']+/i },
];

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function changedFiles(all) {
  const lists = all
    ? [git(["ls-files"])]
    : [git(["diff", "--cached", "--name-only"]), git(["diff", "--name-only"]), git(["ls-files", "--others", "--exclude-standard"])];
  if (lists.every((l) => l === null)) return null;
  const set = new Set();
  for (const l of lists) for (const f of (l ?? "").split(/\r?\n/)) if (f) set.add(f);
  return [...set];
}

function entropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

const all = process.argv.includes("--all");
const files = changedFiles(all);
if (files === null) {
  console.error("security scan: not a git repository or git unavailable; refusing to report clean.");
  process.exit(2);
}

const findings = [];
let scanned = 0;
for (const rel of files) {
  const abs = resolve(root, rel);
  if (!existsSync(abs) || SKIP_NAMES.has(basename(rel)) || SKIP_EXT.has(extname(rel).toLowerCase())) continue;
  let size;
  try { size = statSync(abs).size; } catch { continue; }
  if (size > MAX_BYTES) continue;
  const text = readFileSync(abs, "utf8");
  if (text.includes("\u0000")) continue;
  scanned++;

  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ file: rel, line: i + 1, type: rule.type });
    }
    for (const m of line.matchAll(/["'`]([A-Za-z0-9+/_=-]{32,})["'`]/g)) {
      if (!/^[0-9a-f-]{32,}$/i.test(m[1]) && entropy(m[1]) >= 4.5) {
        findings.push({ file: rel, line: i + 1, type: "HIGH_ENTROPY" });
      }
    }
  });

  if (/(^|\/)\.env(\.|$)/.test(rel) || /\.(pem|p12|pfx)$/i.test(rel)) {
    findings.push({ file: rel, line: 1, type: "CREDENTIAL FILE (should be git-ignored)" });
  }
}

if (findings.length > 0) {
  console.error(`SECURITY SCAN FAILED: ${findings.length} finding(s) in ${scanned} file(s). Values are not printed.`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.type}`);
  console.error("Remove the secret, load it from an environment variable, and rotate it if it was ever committed.");
  process.exit(1);
}
console.log(`SECURITY SCAN CLEAN: ${scanned} changed/new file(s) checked.`);
