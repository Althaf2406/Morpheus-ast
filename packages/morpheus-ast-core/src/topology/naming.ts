/**
 * topology/naming.ts
 *
 * Deterministic, readable names for function-like nodes. The name depends only on the source
 * text, so it is identical across repeated parses, and after a mutation is rolled back.
 *
 * Order of rules (first match wins):
 *   1. declared name (function declaration, method, class member)
 *   2. variable / const the function is assigned to
 *   3. object property, class property or assignment target (`a.b = () => {}` gives "b")
 *   4. `export default` gives "default export"
 *   5. inline callback: "callback passed to <callee>"
 *   6. other nested function: "callback in <enclosing function name>"
 *   7. fallback: "anonymous (line N)", with N the 1-based start line
 *
 * Synthesized names (rules 4 to 7) that would repeat within one file get " (line N)" appended,
 * and " #k" when the line also repeats, so every name in a file is unique.
 */
import * as ts from "typescript";

export type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

export function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** The name used in function ids before readable names existed. Kept so ids stay unchanged. */
export function legacyFunctionName(node: FunctionLike, sourceFile: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(node) && node.name != null) return node.name.text;
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (parent != null && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return `<anonymous:${node.getStart(sourceFile)}>`;
}

const MAX_NAME_LENGTH = 48;

/** Keeps names printable and safe to embed in quoted text. */
function clean(text: string): string {
  let out = "";
  for (const ch of text) {
    if (/[\p{L}\p{N}_$.#@ -]/u.test(ch)) out += ch;
  }
  out = out.trim();
  return out.length > MAX_NAME_LENGTH ? out.slice(0, MAX_NAME_LENGTH) : out;
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return null;
}

/** Dotted text of an identifier / this / property-access chain, or null for anything else. */
function dottedText(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (expr.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    const left = dottedText(expr.expression);
    return left === null ? null : `${left}.${expr.name.text}`;
  }
  return null;
}

function skipWrappers(node: ts.Node): ts.Node {
  let current = node;
  while (
    current.parent != null &&
    (ts.isParenthesizedExpression(current.parent) ||
      ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isNonNullExpression(current.parent) ||
      ts.isTypeAssertionExpression(current.parent))
  ) {
    current = current.parent;
  }
  return current;
}

/** A name from the node's own declaration or the place it is assigned to, or null when anonymous. */
function directName(node: FunctionLike): string | null {
  if (ts.isFunctionDeclaration(node)) {
    if (node.name != null) return node.name.text;
    const isDefault = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    return isDefault ? "default export" : null;
  }
  if (ts.isMethodDeclaration(node)) return propertyNameText(node.name);
  const outer = skipWrappers(node);
  const parent = outer.parent;
  if (parent == null) return null;
  if (ts.isVariableDeclaration(parent) && parent.initializer === outer && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === outer) {
    return propertyNameText(parent.name);
  }
  if (ts.isPropertyDeclaration(parent) && parent.initializer === outer) {
    return propertyNameText(parent.name);
  }
  if (ts.isParameter(parent) && parent.initializer === outer && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isBindingElement(parent) && parent.initializer === outer && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === outer
  ) {
    const target = parent.left;
    if (ts.isIdentifier(target)) return target.text;
    if (ts.isPropertyAccessExpression(target)) {
      return dottedText(target) === "module.exports" ? "module.exports" : target.name.text;
    }
    return null;
  }
  if (ts.isExportAssignment(parent) && !parent.isExportEquals) return "default export";
  if (ts.isExportAssignment(parent)) return "module.exports";
  // A named function expression keeps its own name when nothing else names it.
  if (ts.isFunctionExpression(node) && node.name != null) return node.name.text;
  return null;
}

/** The callee text when the function is an argument of a call or `new`, e.g. "app.use" or "map". */
function calleeOfArgument(node: FunctionLike): string | null {
  const outer = skipWrappers(node);
  const parent = outer.parent;
  if (parent == null) return null;
  if (!(ts.isCallExpression(parent) || ts.isNewExpression(parent))) return null;
  if (!parent.arguments?.some((a) => a === outer)) return null;
  const callee = parent.expression;
  const dotted = dottedText(callee);
  if (dotted !== null) return dotted;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) return callee.name.text;
  return null;
}

function isImmediatelyInvoked(node: FunctionLike): boolean {
  const outer = skipWrappers(node);
  const parent = outer.parent;
  return parent != null && ts.isCallExpression(parent) && parent.expression === outer;
}

function lineOf(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isSynthesized(name: string): boolean {
  return name.startsWith("callback ") || name.startsWith("anonymous (");
}

/** Name before uniqueness is enforced. */
function baseName(node: FunctionLike, sourceFile: ts.SourceFile): string {
  const direct = directName(node);
  if (direct !== null) {
    const cleaned = clean(direct);
    if (cleaned !== "") return cleaned;
  }
  if (!isImmediatelyInvoked(node)) {
    const callee = calleeOfArgument(node);
    if (callee !== null) {
      const cleaned = clean(callee);
      if (cleaned !== "") return `callback passed to ${cleaned}`;
    }
    for (let up: ts.Node | undefined = node.parent; up != null; up = up.parent) {
      if (isFunctionLike(up)) {
        const enclosing = baseName(up, sourceFile);
        if (!isSynthesized(enclosing)) return `callback in ${enclosing}`;
      }
    }
  }
  return `anonymous (line ${lineOf(node, sourceFile)})`;
}

/**
 * Names for every function-like node of a file. Real declared names are never changed (calls
 * are resolved through them). Synthesized names are made unique within the file.
 */
export function computeFunctionNames(sourceFile: ts.SourceFile): Map<ts.Node, string> {
  const nodes: FunctionLike[] = [];
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const bases = nodes.map((node) => baseName(node, sourceFile));
  const synthesizedCount = new Map<string, number>();
  nodes.forEach((node, i) => {
    const base = bases[i] ?? "";
    if (directName(node) === null || base === "default export") {
      synthesizedCount.set(base, (synthesizedCount.get(base) ?? 0) + 1);
    }
  });

  const result = new Map<ts.Node, string>();
  const used = new Set<string>();
  nodes.forEach((node, i) => {
    const base = bases[i] ?? "";
    const synthesized = directName(node) === null || base === "default export";
    let name = base;
    if (synthesized && !base.startsWith("anonymous (") && (synthesizedCount.get(base) ?? 0) > 1) {
      name = `${base} (line ${lineOf(node, sourceFile)})`;
    }
    if (synthesized && used.has(name)) {
      let k = 2;
      while (used.has(`${name} #${k}`)) k++;
      name = `${name} #${k}`;
    }
    used.add(name);
    result.set(node, name);
  });
  return result;
}
