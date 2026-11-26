/**
 * unusedVariable.ts: plans the removal of a declared-but-unused variable.
 *
 * Every offset comes from the TypeScript AST (getStart / getEnd / getFullStart of nodes).
 * Replacement text is built only as the `replacement` field of a splice. No regular
 * expressions are used, and no text is rewritten outside the declaration being removed.
 */

import * as ts from "typescript";
import type { MutationRequest, SecurityScanResult, SpliceRange } from "../contracts.js";

export type FunctionLikeNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

type NamedDeclaration = ts.VariableDeclaration & { readonly name: ts.Identifier };

const NEWLINE = 10; // \n
const CARRIAGE_RETURN = 13; // \r
const SPACE = 32;
const TAB = 9;

/** True when the initializer contains, at any depth, an expression that may have an effect. */
export function isSideEffectInitializer(initializer: ts.Expression): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node)
    ) {
      found = true;
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      found = true;
      return;
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return found;
}

function collectDeclarators(functionNode: FunctionLikeNode): NamedDeclaration[] {
  const result: NamedDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      result.push(node as NamedDeclaration);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(functionNode, visit);
  return result;
}

const TITLE_PREFIX = "Unused variable: ";
const DESCRIPTION_PREFIX = 'Variable "';

/**
 * The variable name an analysis finding carries in its own text. Findings produced by the
 * engine's analysis span the whole function, so the name is only in the title
 * (`Unused variable: <name>`) and the description (`Variable "<name>" is declared ...`).
 * This reads finding metadata, not source text.
 */
function nameFromFinding(finding: SecurityScanResult): string | null {
  if (finding.title.startsWith(TITLE_PREFIX)) {
    const fromTitle = finding.title.slice(TITLE_PREFIX.length);
    if (fromTitle.length > 0) return fromTitle;
  }
  if (finding.description.startsWith(DESCRIPTION_PREFIX)) {
    const close = finding.description.indexOf('"', DESCRIPTION_PREFIX.length);
    if (close > DESCRIPTION_PREFIX.length) {
      return finding.description.slice(DESCRIPTION_PREFIX.length, close);
    }
  }
  return null;
}

/**
 * Picks the declarator the finding points at: first by the name node's offset, then by the
 * variable name carried in the finding text (analysis findings span the whole function), then
 * by the smallest declarator span containing the offset, then by the identifier text at the range.
 */
function locateDeclarator(
  sourceFile: ts.SourceFile,
  functionNode: FunctionLikeNode,
  finding: SecurityScanResult
): NamedDeclaration | null {
  const declarators = collectDeclarators(functionNode);
  const start = finding.range.startIndex;
  const end = finding.range.endIndex;

  const byNameStart = declarators.find((d) => d.name.getStart(sourceFile) === start);
  if (byNameStart !== undefined) return byNameStart;

  const wanted = nameFromFinding(finding);
  if (wanted !== null) {
    const matches = declarators.filter((d) => d.name.text === wanted);
    // Several declarators with one name make the target ambiguous: no safe plan.
    return matches.length === 1 ? matches[0]! : null;
  }

  let tightest: NamedDeclaration | null = null;
  for (const d of declarators) {
    if (d.getStart(sourceFile) <= start && start < d.getEnd()) {
      if (
        tightest === null ||
        d.getEnd() - d.getStart(sourceFile) < tightest.getEnd() - tightest.getStart(sourceFile)
      ) {
        tightest = d;
      }
    }
  }
  if (tightest !== null) return tightest;

  if (end > start && end <= sourceFile.text.length) {
    const text = sourceFile.text.slice(start, end);
    return declarators.find((d) => d.name.text === text) ?? null;
  }
  return null;
}

function isStatementContainer(node: ts.Node): boolean {
  return (
    ts.isBlock(node) ||
    ts.isSourceFile(node) ||
    ts.isModuleBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node)
  );
}

/** Start offset of the line containing `offset`, if only blanks precede `offset` on it. */
function blankLineStart(text: string, offset: number): number | null {
  let i = offset;
  while (i > 0) {
    const c = text.charCodeAt(i - 1);
    if (c === NEWLINE) return i;
    if (c !== SPACE && c !== TAB) return null;
    i -= 1;
  }
  return 0;
}

/** Offset just past the line break that follows `offset`, if only blanks sit between. */
function lineBreakEnd(text: string, offset: number): number | null {
  let i = offset;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === NEWLINE) return i + 1;
    if (c === CARRIAGE_RETURN && text.charCodeAt(i + 1) === NEWLINE) return i + 2;
    if (c !== SPACE && c !== TAB) return null;
    i += 1;
  }
  return null;
}

function initializerStatementText(sourceFile: ts.SourceFile, init: ts.Expression): string {
  const text = init.getText(sourceFile);
  // An expression statement must not begin with `{`, `function` or `class`.
  const needsParens =
    ts.isObjectLiteralExpression(init) ||
    ts.isFunctionExpression(init) ||
    ts.isClassExpression(init) ||
    text.startsWith("{") ||
    text.startsWith("function") ||
    text.startsWith("class");
  return needsParens ? `(${text});` : `${text};`;
}

/**
 * An unused catch binding becomes an optional catch binding: `catch (e) {` -> `catch {`.
 * The single splice covers the parenthesised binding and the blanks up to the block.
 */
function planCatchBindingRemoval(
  sourceFile: ts.SourceFile,
  clause: ts.CatchClause,
  declarator: NamedDeclaration,
  finding: SecurityScanResult
): MutationRequest | null {
  const openParen = clause
    .getChildren(sourceFile)
    .find((child) => child.kind === ts.SyntaxKind.OpenParenToken);
  if (openParen === undefined) return null;
  return {
    splices: [
      {
        filePath: finding.filePath,
        startIndex: openParen.getStart(sourceFile),
        endIndex: clause.block.getStart(sourceFile),
        replacement: "",
        description: `Remove unused catch binding "${declarator.name.text}"`,
      },
    ],
  };
}

export function planUnusedVariableFix(
  sourceFile: ts.SourceFile,
  functionNode: FunctionLikeNode,
  finding: SecurityScanResult
): MutationRequest | null {
  const declarator = locateDeclarator(sourceFile, functionNode, finding);
  if (declarator === null) return null;

  const list = declarator.parent;
  if (ts.isCatchClause(list)) return planCatchBindingRemoval(sourceFile, list, declarator, finding);
  if (!ts.isVariableDeclarationList(list)) return null;
  const statement = list.parent;
  if (!ts.isVariableStatement(statement) || !isStatementContainer(statement.parent)) {
    return null;
  }

  const text = sourceFile.text;
  const filePath = finding.filePath;
  const name = declarator.name.text;
  const initializer = declarator.initializer;
  const hasEffect = initializer !== undefined && isSideEffectInitializer(initializer);
  const statementStart = statement.getStart(sourceFile);
  const statementEnd = statement.getEnd();
  const splices: SpliceRange[] = [];

  if (list.declarations.length === 1) {
    if (hasEffect && initializer !== undefined) {
      splices.push({
        filePath,
        startIndex: statementStart,
        endIndex: statementEnd,
        replacement: initializerStatementText(sourceFile, initializer),
        description: `Keep the initializer of unused variable "${name}" as a statement`,
      });
    } else {
      let startIndex = statementStart;
      let endIndex = statementEnd;
      const lineStart = blankLineStart(text, statementStart);
      const lineEnd = lineBreakEnd(text, statementEnd);
      if (lineStart !== null && lineEnd !== null) {
        startIndex = lineStart;
        endIndex = lineEnd;
      }
      splices.push({
        filePath,
        startIndex,
        endIndex,
        replacement: "",
        description: `Remove unused variable "${name}"`,
      });
    }
    return { splices };
  }

  const index = list.declarations.indexOf(declarator);
  const next = list.declarations[index + 1];
  const previous = list.declarations[index - 1];
  let removeStart: number;
  let removeEnd: number;
  if (next !== undefined) {
    removeStart = declarator.getStart(sourceFile);
    removeEnd = next.getStart(sourceFile);
  } else if (previous !== undefined) {
    removeStart = previous.getEnd();
    removeEnd = declarator.getEnd();
  } else {
    return null;
  }
  splices.push({
    filePath,
    startIndex: removeStart,
    endIndex: removeEnd,
    replacement: "",
    description: `Remove unused variable "${name}" from its declaration list`,
  });

  if (hasEffect && initializer !== undefined) {
    const lineStart = blankLineStart(text, statementStart);
    const indent = lineStart === null ? "" : text.slice(lineStart, statementStart);
    splices.push({
      filePath,
      startIndex: statementEnd,
      endIndex: statementEnd,
      replacement: `\n${indent}${initializerStatementText(sourceFile, initializer)}`,
      description: `Keep the initializer of unused variable "${name}" as a statement`,
    });
  }
  return { splices };
}
