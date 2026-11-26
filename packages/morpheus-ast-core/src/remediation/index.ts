/**
 * remediation/index.ts: deterministic remediation planning.
 *
 * planRemediation maps (finding, sourceText, options) to a MutationRequest or null. It is pure:
 * it reads no file, environment variable or global state, and keeps no state between calls.
 * Every offset comes from the TypeScript AST. The result is applied by the caller through the
 * surgical mutator; nothing here changes text.
 */

import * as ts from "typescript";
import type {
  MutationRequest,
  RemediationOptions,
  SecurityScanResult,
} from "../contracts.js";
import { planUncaughtExceptionFix } from "./uncaughtException.js";
import { planUnusedVariableFix } from "./unusedVariable.js";
import type { FunctionLikeNode } from "./unusedVariable.js";

function isFunctionLike(node: ts.Node): node is FunctionLikeNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function declaredName(node: FunctionLikeNode): string | null {
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name != null) {
    return ts.isIdentifier(node.name) ? node.name.text : null;
  }
  const parent = node.parent;
  if (parent != null && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return null;
}

/**
 * Finds the innermost function whose span contains the finding's start offset. When none does,
 * falls back to the function whose declared name ends the finding's functionId.
 */
function findEnclosingFunction(
  sourceFile: ts.SourceFile,
  finding: SecurityScanResult
): FunctionLikeNode | null {
  const offset = finding.range.startIndex;
  let innermost: FunctionLikeNode | null = null;
  let byName: FunctionLikeNode | null = null;
  const functionId = finding.functionId;

  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      if (node.getStart(sourceFile) <= offset && offset < node.getEnd()) {
        innermost = node;
      }
      if (byName === null && functionId !== null) {
        const name = declaredName(node);
        if (name !== null && functionId.endsWith(`:${name}`)) {
          byName = node;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return innermost ?? byName;
}

export function planRemediation(
  finding: SecurityScanResult,
  sourceText: string,
  options?: RemediationOptions
): MutationRequest | null {
  const errorCause = options?.errorCause ?? false;

  if (finding.category !== "UNUSED_VARIABLE" && finding.category !== "UNCAUGHT_EXCEPTION") {
    return null;
  }

  // The SourceFile is local to this call and holds no native handle, so nothing needs
  // releasing. No reference to it escapes this function.
  const sourceFile = ts.createSourceFile(
    finding.filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );

  const functionNode = findEnclosingFunction(sourceFile, finding);
  if (functionNode === null) return null;

  if (finding.category === "UNUSED_VARIABLE") {
    return planUnusedVariableFix(sourceFile, functionNode, finding);
  }
  return planUncaughtExceptionFix(sourceFile, functionNode, finding, errorCause);
}
