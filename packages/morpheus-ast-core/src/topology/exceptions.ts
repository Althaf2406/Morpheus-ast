/**
 * topology/exceptions.ts
 *
 * Deterministic rule for "uncaught exception path". A function has one only if, outside a try
 * block that has a catch clause, it contains at least one risky operation:
 *   - a `throw` statement
 *   - an `await` expression (including `for await`)
 *   - a call to a known-throwing API (see RISKY_* below)
 *   - a call to another function of the same repository that itself has an uncaught path
 *     (decided by the fixed point in `resolveUncaughtPaths`)
 *
 * Plain calls, array methods, logging and arithmetic are not risky on their own. Nested
 * functions are analysed on their own, so their operations never count for the enclosing one.
 */
import * as ts from "typescript";
import { isFunctionLike } from "./naming.js";

const RISKY_GLOBAL_CALLS: ReadonlySet<string> = new Set([
  "fetch",
  "require",
  "decodeURIComponent",
  "encodeURIComponent",
  "decodeURI",
  "encodeURI",
  "structuredClone",
]);
const GLOBAL_OBJECTS: ReadonlySet<string> = new Set(["globalThis", "window", "self", "global"]);
const RISKY_OBJECT_CALLS: ReadonlySet<string> = new Set(["JSON.parse"]);
const FS_MODULES: ReadonlySet<string> = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
const DEFAULT_FS_RECEIVERS: readonly string[] = ["fs", "fsp", "fsPromises"];
const FS_METHODS: ReadonlySet<string> = new Set([
  "readFile", "writeFile", "appendFile", "readdir", "mkdir", "mkdtemp", "unlink", "rm", "rmdir",
  "stat", "lstat", "copyFile", "cp", "rename", "access", "open", "opendir", "readlink", "symlink",
  "link", "truncate", "realpath", "chmod", "chown", "utimes",
  "readFileSync", "writeFileSync", "appendFileSync", "readdirSync", "mkdirSync", "mkdtempSync",
  "unlinkSync", "rmSync", "rmdirSync", "statSync", "lstatSync", "copyFileSync", "cpSync",
  "renameSync", "accessSync", "openSync", "opendirSync", "readlinkSync", "symlinkSync",
  "linkSync", "truncateSync", "realpathSync", "chmodSync", "chownSync", "utimesSync",
]);

/** A call to a possibly repository-defined function, resolved later by name. */
export interface PendingCall {
  readonly name: string;
  /** True for `this.name(...)`, which only resolves inside the same file. */
  readonly viaThis: boolean;
}

export interface ExceptionFacts {
  /** Risky operations found outside try blocks, in source order, without duplicates. */
  readonly directReasons: readonly string[];
  /** Calls outside try blocks that may be repository functions, in source order. */
  readonly pendingCalls: readonly PendingCall[];
}

export interface FileExceptionContext {
  /** Local names bound to the fs or fs/promises module (or its `promises` object). */
  readonly fsReceivers: ReadonlySet<string>;
  /** Local names bound directly to an fs function, such as `readFile` imported by name. */
  readonly fsFunctions: ReadonlySet<string>;
  /** Names of functions declared in this file; they shadow same-named global APIs. */
  readonly localFunctionNames: ReadonlySet<string>;
}

function isFsModuleText(node: ts.Expression | undefined): boolean {
  return node !== undefined && ts.isStringLiteralLike(node) && FS_MODULES.has(node.text);
}

function requiredModule(init: ts.Expression | undefined): boolean {
  return (
    init !== undefined &&
    ts.isCallExpression(init) &&
    ts.isIdentifier(init.expression) &&
    init.expression.text === "require" &&
    isFsModuleText(init.arguments[0])
  );
}

export function buildFileContext(
  sourceFile: ts.SourceFile,
  localFunctionNames: ReadonlySet<string>
): FileExceptionContext {
  const fsReceivers = new Set<string>(DEFAULT_FS_RECEIVERS);
  const fsFunctions = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isFsModuleText(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.name !== undefined) fsReceivers.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) fsReceivers.add(bindings.name.text);
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const imported = (element.propertyName ?? element.name).text;
          if (imported === "promises") fsReceivers.add(element.name.text);
          else if (FS_METHODS.has(imported)) fsFunctions.add(element.name.text);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && requiredModule(node.initializer)) {
      if (ts.isIdentifier(node.name)) fsReceivers.add(node.name.text);
      else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (!ts.isIdentifier(element.name)) continue;
          const imported = element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : element.name.text;
          if (imported === "promises") fsReceivers.add(element.name.text);
          else if (FS_METHODS.has(imported)) fsFunctions.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { fsReceivers, fsFunctions, localFunctionNames };
}

function dotted(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    const left = dotted(expr.expression);
    return left === null ? null : `${left}.${expr.name.text}`;
  }
  return null;
}

/** The text of the known-throwing API a call refers to, or null when it is not one. */
function riskyApiName(call: ts.CallExpression, ctx: FileExceptionContext): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) {
    const name = callee.text;
    if (ctx.fsFunctions.has(name)) return name;
    if (RISKY_GLOBAL_CALLS.has(name) && !ctx.localFunctionNames.has(name)) return name;
    return null;
  }
  const text = dotted(callee);
  if (text === null) return null;
  if (RISKY_OBJECT_CALLS.has(text)) return text;
  const parts = text.split(".");
  const method = parts[parts.length - 1] ?? "";
  const receiver = parts.slice(0, -1);
  const root = receiver[0] ?? "";
  if (receiver.length === 1 && GLOBAL_OBJECTS.has(root) && method === "fetch") return text;
  if (FS_METHODS.has(method) && ctx.fsReceivers.has(root)) {
    const rest = receiver.slice(1);
    if (rest.length === 0 || (rest.length === 1 && rest[0] === "promises")) return text;
  }
  return null;
}

export function collectExceptionFacts(fnNode: ts.Node, ctx: FileExceptionContext): ExceptionFacts {
  const reasons: string[] = [];
  const pending: PendingCall[] = [];
  const addReason = (reason: string): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const visit = (node: ts.Node, protectedByCatch: boolean): void => {
    if (isFunctionLike(node) || ts.isConstructorDeclaration(node) || ts.isAccessor(node)) return;
    if (ts.isTryStatement(node)) {
      const hasCatch = node.catchClause !== undefined;
      visit(node.tryBlock, protectedByCatch || hasCatch);
      // The catch clause is where the caught error is handled, so it counts as handled code.
      if (node.catchClause !== undefined) visit(node.catchClause, true);
      if (node.finallyBlock !== undefined) visit(node.finallyBlock, protectedByCatch);
      return;
    }
    if (!protectedByCatch) {
      if (ts.isThrowStatement(node)) addReason("throws");
      else if (ts.isAwaitExpression(node)) addReason("awaits without try/catch");
      else if (ts.isForOfStatement(node) && node.awaitModifier !== undefined) {
        addReason("awaits without try/catch");
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL"
        && !ctx.localFunctionNames.has("URL")) {
        addReason("calls new URL");
      } else if (ts.isCallExpression(node)) {
        const api = riskyApiName(node, ctx);
        if (api !== null) addReason(`calls ${api}`);
        else if (ts.isIdentifier(node.expression)) {
          pending.push({ name: node.expression.text, viaThis: false });
        } else if (
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
          ts.isIdentifier(node.expression.name)
        ) {
          pending.push({ name: node.expression.name.text, viaThis: true });
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, protectedByCatch));
  };
  ts.forEachChild(fnNode, (child) => visit(child, false));
  return { directReasons: reasons, pendingCalls: pending };
}

export interface FunctionExceptionInput {
  readonly id: string;
  readonly filePath: string;
  readonly name: string;
  readonly facts: ExceptionFacts;
}

export interface FunctionExceptionResult {
  readonly hasUncaughtException: boolean;
  readonly reasons: readonly string[];
}

/**
 * Propagates through the call graph until nothing changes. The flagged set only grows and is
 * bounded by the number of functions, so cycles terminate. Callee lookup: a name declared in the
 * caller's file wins; otherwise a name must be unique in the whole repository. `this.name()`
 * resolves only inside the caller's file, and only when the name is unique there.
 */
export function resolveUncaughtPaths(
  inputs: readonly FunctionExceptionInput[]
): Map<string, FunctionExceptionResult> {
  const byFile = new Map<string, Map<string, string[]>>();
  const global = new Map<string, string[]>();
  for (const fn of inputs) {
    let local = byFile.get(fn.filePath);
    if (local === undefined) {
      local = new Map();
      byFile.set(fn.filePath, local);
    }
    const inFile = local.get(fn.name);
    if (inFile === undefined) local.set(fn.name, [fn.id]);
    else inFile.push(fn.id);
    const everywhere = global.get(fn.name);
    if (everywhere === undefined) global.set(fn.name, [fn.id]);
    else everywhere.push(fn.id);
  }

  const resolve = (caller: FunctionExceptionInput, call: PendingCall): string | undefined => {
    const local = byFile.get(caller.filePath)?.get(call.name);
    if (local !== undefined) {
      if (local.length === 1) return local[0];
      // Several functions share the name in this file: the last declaration wins for plain calls.
      return call.viaThis ? undefined : local[local.length - 1];
    }
    if (call.viaThis) return undefined;
    const candidates = global.get(call.name);
    return candidates !== undefined && candidates.length === 1 ? candidates[0] : undefined;
  };

  const resolvedCalls = new Map<string, { id: string; name: string }[]>();
  for (const fn of inputs) {
    const targets: { id: string; name: string }[] = [];
    for (const call of fn.facts.pendingCalls) {
      const id = resolve(fn, call);
      if (id !== undefined && id !== fn.id) targets.push({ id, name: call.name });
    }
    resolvedCalls.set(fn.id, targets);
  }

  const flagged = new Set<string>();
  for (const fn of inputs) if (fn.facts.directReasons.length > 0) flagged.add(fn.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of inputs) {
      if (flagged.has(fn.id)) continue;
      if ((resolvedCalls.get(fn.id) ?? []).some((t) => flagged.has(t.id))) {
        flagged.add(fn.id);
        changed = true;
      }
    }
  }

  const results = new Map<string, FunctionExceptionResult>();
  for (const fn of inputs) {
    const reasons = [...fn.facts.directReasons];
    for (const target of resolvedCalls.get(fn.id) ?? []) {
      const reason = `calls ${target.name} which can throw`;
      if (flagged.has(target.id) && !reasons.includes(reason)) reasons.push(reason);
    }
    results.set(fn.id, { hasUncaughtException: flagged.has(fn.id), reasons });
  }
  return results;
}
