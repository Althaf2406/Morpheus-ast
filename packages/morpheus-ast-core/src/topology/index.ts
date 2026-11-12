/**
 * topology/index.ts
 *
 * 3D Spatial Graph Compiler — transforms ParsedFile[] into a TopologyGraph
 * where modules become spatial clusters, functions become nodes sized by
 * Cyclomatic Complexity, and call relationships become directed edges.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero `any` types
 *   - Zero domain-specific vocabulary
 *   - Zero UI framework imports
 */

import * as ts from "typescript";
import type {
  ParsedFile,
  TopologyGraph,
  ModuleNode,
  FunctionNode,
  CallEdge,
  SourceRange,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// TopologyCompiler
// ─────────────────────────────────────────────────────────────────────────────

export class TopologyCompiler {
  async build(parsedFiles: readonly ParsedFile[]): Promise<TopologyGraph> {
    const startMs = Date.now();

    const allFunctions: FunctionNode[] = [];
    const allModules: ModuleNode[] = [];
    const allEdges: CallEdge[] = [];
    let edgeCounter = 0;

    for (const file of parsedFiles) {
      if (file.sourceText === "" || file.hasErrors) continue;

      const sourceFile = ts.createSourceFile(
        file.filePath,
        file.sourceText,
        ts.ScriptTarget.ES2022,
        true
      );

      const functions = this.extractFunctions(sourceFile, file.filePath);
      allFunctions.push(...functions);

      const edges = this.extractCallEdges(sourceFile, functions, edgeCounter);
      edgeCounter += edges.length;
      allEdges.push(...edges);

      const moduleNode: ModuleNode = {
        id: `module:${file.filePath}`,
        filePath: file.filePath,
        functionIds: functions.map((f) => f.id),
        isCircularDepMember: false, // updated below
      };
      allModules.push(moduleNode);
    }

    // Detect circular dependencies via DFS cycle detection
    const cycles = this.detectCycles(allFunctions, allEdges);
    const cycleSet = new Set(cycles.flatMap((c) => c));

    // Promote isCyclic on edges and hasCircularDep on functions — rebuild as new objects
    const finalFunctions: FunctionNode[] = allFunctions.map((fn) =>
      cycleSet.has(fn.id) ? { ...fn, hasCircularDep: true } : fn
    );
    const finalEdges: CallEdge[] = allEdges.map((e) =>
      cycleSet.has(e.callerId) && cycleSet.has(e.calleeId)
        ? { ...e, isCyclic: true }
        : e
    );
    const finalModules: ModuleNode[] = allModules.map((m) => ({
      ...m,
      isCircularDepMember: m.functionIds.some((id) => cycleSet.has(id)),
    }));

    const totalComplexity = finalFunctions.reduce(
      (sum, f) => sum + f.cyclomaticComplexity, 0
    );

    return {
      modules: finalModules,
      functions: finalFunctions,
      edges: finalEdges,
      totalComplexity,
      circularDepCount: cycles.length,
      durationMs: Date.now() - startMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Function extraction
  // ─────────────────────────────────────────────────────────────────────────

  private extractFunctions(
    sourceFile: ts.SourceFile,
    filePath: string
  ): FunctionNode[] {
    const results: FunctionNode[] = [];
    let fnCounter = 0;

    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const name = this.getFunctionName(node, sourceFile);
        const range = this.getSourceRange(node, sourceFile, filePath);
        const complexity = this.computeCyclomaticComplexity(node);
        const unusedVars = this.detectUnusedVariables(node, sourceFile);
        const hasUncaught = this.hasUncaughtExceptionPath(node);
        const paramCount = ts.isFunctionLike(node)
          ? node.parameters.length
          : 0;

        results.push({
          id: `fn:${filePath}:${fnCounter++}:${name}`,
          name,
          filePath,
          range,
          cyclomaticComplexity: complexity,
          hasCircularDep: false, // set by cycle detection
          unusedVariables: unusedVars,
          hasUncaughtException: hasUncaught,
          parameterCount: paramCount,
        });
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Call edge extraction
  // ─────────────────────────────────────────────────────────────────────────

  private extractCallEdges(
    sourceFile: ts.SourceFile,
    functions: readonly FunctionNode[],
    startCounter: number
  ): CallEdge[] {
    const edges: CallEdge[] = [];
    let counter = startCounter;

    // Build a name → id map for fast lookup
    const nameToId = new Map<string, string>();
    for (const fn of functions) {
      nameToId.set(fn.name, fn.id);
    }

    // For each function, find all call expressions inside it
    for (const callerFn of functions) {
      const callerNode = this.findNodeById(sourceFile, callerFn);
      if (callerNode == null) continue;

      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const calleeName = this.getCalleeName(node);
          const calleeId = calleeName != null ? nameToId.get(calleeName) : undefined;
          if (calleeId != null && calleeId !== callerFn.id) {
            const callSite = this.getSourceRange(node, sourceFile, callerFn.filePath);
            edges.push({
              id: `edge:${counter++}`,
              callerId: callerFn.id,
              calleeId,
              callSite,
              isCyclic: false, // set later
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(callerNode);
    }

    return edges;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cyclomatic Complexity (McCabe)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * McCabe Cyclomatic Complexity = number of decision points + 1
   * Decision points: if, else-if, for, while, do-while, case, catch,
   *                  ternary (?:), logical AND (&&), logical OR (||)
   */
  computeCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1;

    const visit = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression: {
          const bin = n as ts.BinaryExpression;
          if (
            bin.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            bin.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            bin.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          ) {
            complexity++;
          }
          break;
        }
      }
      ts.forEachChild(n, visit);
    };

    ts.forEachChild(node, visit);
    return complexity;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cycle detection (DFS with colour marking)
  // ─────────────────────────────────────────────────────────────────────────

  private detectCycles(
    functions: readonly FunctionNode[],
    edges: readonly CallEdge[]
  ): string[][] {
    const adj = new Map<string, string[]>();
    for (const fn of functions) adj.set(fn.id, []);
    for (const e of edges) {
      adj.get(e.callerId)?.push(e.calleeId);
    }

    type Color = "WHITE" | "GRAY" | "BLACK";
    const color = new Map<string, Color>();
    for (const fn of functions) color.set(fn.id, "WHITE");

    const cycles: string[][] = [];
    const path: string[] = [];

    const dfs = (id: string): void => {
      color.set(id, "GRAY");
      path.push(id);

      for (const neighbor of adj.get(id) ?? []) {
        if (color.get(neighbor) === "GRAY") {
          // Found a back-edge — extract the cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart));
          }
        } else if (color.get(neighbor) === "WHITE") {
          dfs(neighbor);
        }
      }

      path.pop();
      color.set(id, "BLACK");
    };

    for (const fn of functions) {
      if (color.get(fn.id) === "WHITE") dfs(fn.id);
    }

    return cycles;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Unused variable detection
  // ─────────────────────────────────────────────────────────────────────────

  private detectUnusedVariables(
    fnNode: ts.Node,
    sourceFile: ts.SourceFile
  ): string[] {
    const declared = new Map<string, number>(); // name → declaration count
    const used = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const name = node.name.text;
        declared.set(name, (declared.get(name) ?? 0) + 1);
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        // Don't count the declaration itself as a use
        if (!ts.isVariableDeclaration(parent) || parent.name !== node) {
          used.add(node.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(fnNode, visit);

    const unused: string[] = [];
    for (const [name] of declared) {
      if (!used.has(name)) unused.push(name);
    }
    return unused;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Uncaught exception detection
  // ─────────────────────────────────────────────────────────────────────────

  private hasUncaughtExceptionPath(fnNode: ts.Node): boolean {
    // A function has an uncaught exception path if it contains at least one
    // call expression OR throw statement NOT wrapped in a try/catch block
    let hasTryCatch = false;
    let hasUncoveredThrow = false;

    const visit = (node: ts.Node, inTry: boolean): void => {
      if (ts.isTryStatement(node)) {
        hasTryCatch = true;
        // Visit the try block with inTry=true
        visit(node.tryBlock, true);
        // Visit the catch clause separately (also protected)
        if (node.catchClause != null) visit(node.catchClause, true);
        if (node.finallyBlock != null) visit(node.finallyBlock, inTry);
        return;
      }
      if (ts.isThrowStatement(node) && !inTry) {
        hasUncoveredThrow = true;
      }
      ts.forEachChild(node, (child) => visit(child, inTry));
    };

    ts.forEachChild(fnNode, (child) => visit(child, false));

    // If there are call expressions but no try/catch wrapping them, flag it
    if (!hasTryCatch) {
      let hasCallExpr = false;
      const findCalls = (n: ts.Node): void => {
        if (ts.isCallExpression(n)) { hasCallExpr = true; return; }
        ts.forEachChild(n, findCalls);
      };
      ts.forEachChild(fnNode, findCalls);
      return hasCallExpr || hasUncoveredThrow;
    }

    return hasUncoveredThrow;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private getFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string {
    if (ts.isFunctionDeclaration(node) && node.name != null) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    // Arrow or anonymous — use parent variable name if available
    const parent = node.parent;
    if (
      parent != null &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name)
    ) {
      return parent.name.text;
    }
    const pos = node.getStart(sourceFile);
    return `<anonymous:${pos}>`;
  }

  private getSourceRange(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string
  ): SourceRange {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      filePath,
      startLine: start.line + 1,
      startColumn: start.character,
      endLine: end.line + 1,
      endColumn: end.character,
      startIndex: node.getStart(sourceFile),
      endIndex: node.getEnd(),
    };
  }

  private getCalleeName(callExpr: ts.CallExpression): string | null {
    const expr = callExpr.expression;
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
      return expr.name.text;
    }
    return null;
  }

  private findNodeById(
    sourceFile: ts.SourceFile,
    fn: FunctionNode
  ): ts.Node | null {
    // Find the function node at the recorded start index
    let found: ts.Node | null = null;
    const visit = (node: ts.Node): void => {
      if (found != null) return;
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isMethodDeclaration(node)) &&
        node.getStart(sourceFile) === fn.range.startIndex
      ) {
        found = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return found;
  }
}
