/**
 * uncaughtException.ts: plans a try/catch wrapper that rethrows with context.
 *
 * The original body is wrapped by pure insertions: one splice per non-blank body line that adds a
 * single indentation level, one that opens the try block on its own line (it rewrites the first
 * line's leading whitespace with itself), and one zero-width splice that closes the block. No
 * original character is removed. When the body does not occupy its own lines (for example a
 * one-line body) a two-splice layout is used instead. The catch clause only throws: no return statement and no
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

const LEADING_WHITESPACE = /^[ \t]*/;
const MULTI_LINE_FALLBACK_UNIT = "  ";

function lineStartOf(text: string, position: number): number {
  return text.lastIndexOf("\n", position - 1) + 1;
}

function lineEndOf(text: string, position: number): number {
  const newline = text.indexOf("\n", position);
  const end = newline === -1 ? text.length : newline;
  return end > position && text[end - 1] === "\r" ? end - 1 : end;
}

function leadingWhitespaceOf(text: string, lineStart: number): string {
  return LEADING_WHITESPACE.exec(text.slice(lineStart, lineEndOf(text, lineStart)))?.[0] ?? "";
}

/** One indentation level: a tab, or 2 or 4 spaces, inferred from the source. */
function detectIndentUnit(text: string, bodyIndent: string, headerIndent: string): string {
  if (bodyIndent.includes("\t")) return "\t";
  const difference = bodyIndent.length - headerIndent.length;
  if (difference === 2 || difference === 4) return " ".repeat(difference);
  let narrowest = Number.POSITIVE_INFINITY;
  for (const line of text.split("\n")) {
    const spaces = leadingWhitespaceOf(line, 0);
    const rest = line.slice(spaces.length);
    if (spaces.length > 0 && !spaces.includes("\t") && rest !== "" && !rest.startsWith("*")) {
      narrowest = Math.min(narrowest, spaces.length);
    }
  }
  if (narrowest === 2 || narrowest === 4) return " ".repeat(narrowest);
  return MULTI_LINE_FALLBACK_UNIT;
}

/** Ranges of tokens whose line breaks are part of their value; indenting inside them would change it. */
function collectMultiLineTokens(body: ts.Block, sourceFile: ts.SourceFile): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node) ||
      ts.isJsxText(node)
    ) {
      const start = node.getStart(sourceFile);
      if (sourceFile.text.slice(start, node.getEnd()).includes("\n")) {
        ranges.push([start, node.getEnd()]);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return ranges;
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
  const text = sourceFile.text;
  const functionName = resolveFunctionName(functionNode, sourceFile);
  const id = chooseIdentifier(collectDeclaredNames(functionNode));
  const throwStatement = errorCause
    ? `throw new Error("${functionName} failed", { cause: ${id} });`
    : `throw new Error(\`${functionName} failed: \${String(${id})}\`);`;

  const openStart = first.getStart(sourceFile);
  const closeEnd = last.getEnd();
  const firstLineStart = lineStartOf(text, openStart);
  const lastLineEnd = lineEndOf(text, closeEnd);
  const headerIndent = leadingWhitespaceOf(text, lineStartOf(text, functionNode.getStart(sourceFile)));
  const bodyIndent = leadingWhitespaceOf(text, firstLineStart);
  const startsOwnLine = text.slice(firstLineStart, openStart) === bodyIndent;
  const trailing = text.slice(closeEnd, lastLineEnd).trim();
  const endsOwnLine = trailing === "" || trailing.startsWith("//");

  if (!startsOwnLine || !endsOwnLine || firstLineStart <= body.getStart(sourceFile)) {
    return planInlineLayout(finding, functionName, id, throwStatement, openStart, closeEnd, headerIndent);
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const unit = detectIndentUnit(text, bodyIndent, headerIndent);
  const protectedRanges = collectMultiLineTokens(body, sourceFile);
  const splices: SpliceRange[] = [];

  splices.push({
    filePath: finding.filePath,
    startIndex: lastLineEnd,
    endIndex: lastLineEnd,
    replacement:
      `${newline}${bodyIndent}} catch (${id}) {` +
      `${newline}${bodyIndent}${unit}${throwStatement}` +
      `${newline}${bodyIndent}}`,
    description: `Close try block and rethrow with context in ${functionName}`,
  });

  // Walk the body lines from the last to the first so the batch stays in descending order.
  const lineStarts: number[] = [];
  for (let at = firstLineStart; at < lastLineEnd; ) {
    lineStarts.push(at);
    const newlineAt = text.indexOf("\n", at);
    if (newlineAt === -1) break;
    at = newlineAt + 1;
  }
  for (let index = lineStarts.length - 1; index >= 0; index--) {
    const lineStart = lineStarts[index];
    if (lineStart === undefined) continue;
    const contentStart = lineStart + leadingWhitespaceOf(text, lineStart).length;
    if (index === 0) {
      splices.push({
        filePath: finding.filePath,
        startIndex: lineStart,
        endIndex: contentStart,
        replacement: `${bodyIndent}try {${newline}${bodyIndent}${unit}`,
        description: `Open try block on its own line and indent the first body line in ${functionName}`,
      });
      continue;
    }
    const blank = contentStart >= lineEndOf(text, lineStart);
    const insideToken = protectedRanges.some(([from, to]) => lineStart > from && lineStart < to);
    if (blank || insideToken) continue;
    splices.push({
      filePath: finding.filePath,
      startIndex: contentStart,
      endIndex: contentStart,
      replacement: unit,
      description: `Indent one level inside the try block of ${functionName}`,
    });
  }
  return { splices };
}

/** Layout for bodies that share a line with a brace: two zero-width insertions around the statements. */
function planInlineLayout(
  finding: SecurityScanResult,
  functionName: string,
  id: string,
  throwStatement: string,
  openStart: number,
  closeEnd: number,
  indent: string
): MutationRequest {
  const closeSplice: SpliceRange = {
    filePath: finding.filePath,
    startIndex: closeEnd,
    endIndex: closeEnd,
    replacement: `\n${indent}} catch (${id}) {\n${indent}  ${throwStatement}\n${indent}}`,
    description: `Close try block and rethrow with context in ${functionName}`,
  };
  const openSplice: SpliceRange = {
    filePath: finding.filePath,
    startIndex: openStart,
    endIndex: openStart,
    replacement: "try {\n",
    description: `Open try block around the body of ${functionName}`,
  };
  return { splices: [closeSplice, openSplice] };
}
