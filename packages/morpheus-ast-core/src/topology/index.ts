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
import { computeFunctionNames, isFunctionLike, legacyFunctionName } from "./naming.js";
import {
  buildFileContext,
  collectExceptionFacts,
  resolveUncaughtPaths,
  type FunctionExceptionInput,
} from "./exceptions.js";

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

    const parsedSources: {
      file: ParsedFile;
      sourceFile: ts.SourceFile;
      functions: FunctionNode[];
    }[] = [];
    const exceptionInputs: FunctionExceptionInput[] = [];

    for (const file of parsedFiles) {
      if (file.sourceText === "" || file.hasErrors) continue;

      const sourceFile = ts.createSourceFile(
        file.filePath,
        file.sourceText,
        ts.ScriptTarget.ES2022,
        true
      );

      const { functions, exceptionInputs: inputs } = this.extractFunctions(sourceFile, file.filePath);
      exceptionInputs.push(...inputs);
      parsedSources.push({ file, sourceFile, functions });
    }
    // Decide uncaught exception paths for the whole repository (propagates through calls).
    const uncaught = resolveUncaughtPaths(exceptionInputs);
    for (const source of parsedSources) {
      source.functions = source.functions.map((fn) => {
        const result = uncaught.get(fn.id);
        return result === undefined
          ? fn
          : { ...fn, hasUncaughtException: result.hasUncaughtException, uncaughtReasons: result.reasons };
      });
      allFunctions.push(...source.functions);
    }

    // Index every function by name so calls can be resolved across files.
    const globalByName = new Map<string, string[]>();
    for (const fn of allFunctions) {
      const ids = globalByName.get(fn.name);
      if (ids === undefined) globalByName.set(fn.name, [fn.id]);
      else ids.push(fn.id);
    }

    for (const { file, sourceFile, functions } of parsedSources) {
      const edges = this.extractCallEdges(sourceFile, functions, edgeCounter, globalByName);
      edgeCounter += edges.length;
      allEdges.push(...edges);

      allModules.push({
        id: `module:${file.filePath}`,
        filePath: file.filePath,
        functionIds: functions.map((f) => f.id),
        isCircularDepMember: false, // updated below
      });
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
  ): { functions: FunctionNode[]; exceptionInputs: FunctionExceptionInput[] } {
    const results: FunctionNode[] = [];
    const exceptionInputs: FunctionExceptionInput[] = [];
    const names = computeFunctionNames(sourceFile);
    const localNames = new Set<string>();
    for (const name of names.values()) localNames.add(name);
    const context = buildFileContext(sourceFile, localNames);
    let fnCounter = 0;
    const visit = (node: ts.Node): void => {
      if (isFunctionLike(node)) {
        const name = names.get(node) ?? legacyFunctionName(node, sourceFile);
        const id = `fn:${filePath}:${fnCounter++}:${legacyFunctionName(node, sourceFile)}`;
        const range = this.getSourceRange(node, sourceFile, filePath);
        const complexity = this.computeCyclomaticComplexity(node);
        const unusedVars = this.detectUnusedVariables(node, sourceFile);
        const facts = collectExceptionFacts(node, context);
        exceptionInputs.push({ id, filePath, name, facts });
        results.push({
          id,
          name,
          filePath,
          range,
          cyclomaticComplexity: complexity,
          hasCircularDep: false, // set by cycle detection
          unusedVariables: unusedVars,
          hasUncaughtException: false, // set once every file is analysed
          parameterCount: node.parameters.length,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return { functions: results, exceptionInputs };
  }
  // ─────────────────────────────────────────────────────────────────────────
  // Call edge extraction
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolves a called name to a function id. A function in the same file wins;
   * otherwise a name is resolved globally only when exactly one function has it,
   * so ambiguous names never create a wrong edge.
   */
  private resolveCallee(
    name: string,
    sameFile: ReadonlyMap<string, string>,
    globalByName: ReadonlyMap<string, readonly string[]>
  ): string | undefined {
    const local = sameFile.get(name);
    if (local !== undefined) return local;
    const candidates = globalByName.get(name);
    return candidates !== undefined && candidates.length === 1 ? candidates[0] : undefined;
  }
  private extractCallEdges(
    sourceFile: ts.SourceFile,
    functions: readonly FunctionNode[],
    startCounter: number,
    globalByName: ReadonlyMap<string, readonly string[]>
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
          const calleeId =
            calleeName != null ? this.resolveCallee(calleeName, nameToId, globalByName) : undefined;
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
    _sourceFile: ts.SourceFile
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
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

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
