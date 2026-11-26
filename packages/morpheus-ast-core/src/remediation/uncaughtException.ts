/**
 * uncaughtException.ts: plans a try/catch wrapper that rethrows with context.
 *
 * The whole original body is wrapped using exactly two zero-width insertion splices, so the
 * original body text is never touched. The catch clause only throws: no return statement and no
 * fallback value is emitted, for void, value-returning and async functions alike. The planner
 * reads no file, environment variable or configuration.
 */

import * as ts from "typescript";
import type { MutationRequest, SecurityScanResult, SpliceRange } from "../contracts.js";
import type { FunctionLikeNode } from "./unusedVariable.js";

/** Mirrors the function name resolution of the topology analyzer, including its anonymous label. */
function resolveFunctionName(node: FunctionLikeNode, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) && node.name != null) {
    return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  const parent = node.parent;
  if (parent != null && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return `<anonymous:${node.getStart(sourceFile)}>`;
}

function collectBindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collectBindingNames(element.name, into);
    }
  }
}

/** Collects every name declared anywhere in the function: parameters, locals, nested functions, classes. */
function collectDeclaredNames(functionNode: FunctionLikeNode): Set<string> {
  const names = new Set<string>();
  for (const parameter of functionNode.parameters) {
    collectBindingNames(parameter.name, names);
  }
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      collectBindingNames(node.name, names);
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node)) &&
      node.name != null
    ) {
      names.add(node.name.text);
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node !== functionNode
    ) {
      for (const parameter of node.parameters) {
        collectBindingNames(parameter.name, names);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(functionNode, visit);
  return names;
}

function chooseIdentifier(taken: ReadonlySet<string>): string {
  if (!taken.has("error")) return "error";
  let counter = 2;
  while (taken.has(`error${counter}`)) {
    counter += 1;
  }
  return `error${counter}`;
}

export function planUncaughtExceptionFix(
  sourceFile: ts.SourceFile,
  functionNode: FunctionLikeNode,
  finding: SecurityScanResult,
  errorCause: boolean
): MutationRequest | null {
  const body = functionNode.body;
  if (body === undefined || !ts.isBlock(body) || body.statements.length === 0) {
    return null;
  }

  const first = body.statements[0];
  const last = body.statements[body.statements.length - 1];
  if (first === undefined || last === undefined) return null;

  const functionName = resolveFunctionName(functionNode, sourceFile);
  const id = chooseIdentifier(collectDeclaredNames(functionNode));

  const throwStatement = errorCause
    ? `throw new Error("${functionName} failed", { cause: ${id} });`
    : `throw new Error(\`${functionName} failed: \${String(${id})}\`);`;

  const openStart = first.getStart(sourceFile);
  const closeEnd = last.getEnd();

  const closeSplice: SpliceRange = {
    filePath: finding.filePath,
    startIndex: closeEnd,
    endIndex: closeEnd,
    replacement: `\n} catch (${id}) {\n  ${throwStatement}\n}`,
    description: `Close try block and rethrow with context in ${functionName}`,
  };
  const openSplice: SpliceRange = {
    filePath: finding.filePath,
    startIndex: openStart,
    endIndex: openStart,
    replacement: "try {\n",
    description: `Open try block around the body of ${functionName}`,
  };

  // Descending order of startIndex.
  return { splices: [closeSplice, openSplice] };
}
