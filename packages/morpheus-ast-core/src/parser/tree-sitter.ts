/**
 * parser/tree-sitter.ts
 *
 * Tree-sitter (WASM) parsing with guaranteed tree release.
 *
 * Contract (.kiro/steering/ast-surgical-splice.md section 4):
 *   - Every Tree returned by parser.parse() is released with tree.delete() in a
 *     finally block before the call returns or throws.
 *   - Callers receive tree nodes only inside the `withTree` callback. Nodes are
 *     views into WASM memory and MUST NOT be kept after the callback returns.
 *   - One TreeSitterParser instance must not be used by concurrent async calls;
 *     withTree is synchronous, so a single instance is safe in a single thread.
 *
 * Offsets: web-tree-sitter reports startIndex/endIndex as UTF-16 code-unit
 * indexes into the JavaScript string that was parsed, the same unit the
 * mutator's SpliceRange uses.
 */

import Parser from "web-tree-sitter";
import { TreeMemoryAuditor, globalMemoryAuditor } from "./index.js";

export type TreeSitterGrammar = string | Uint8Array;

export interface TreeSitterAnalysis {
  readonly nodeCount: number;
  readonly hasErrors: boolean;
}

let runtimeReady: Promise<void> | null = null;

export class TreeSitterParser {
  private disposed = false;

  private constructor(
    private readonly parser: Parser,
    private readonly auditor: TreeMemoryAuditor
  ) {}

  /**
   * Loads the WASM runtime (once per process) and the given grammar.
   * `grammar` is a path/URL to, or the bytes of, a tree-sitter-*.wasm file.
   */
  static async create(
    grammar: TreeSitterGrammar,
    auditor: TreeMemoryAuditor = globalMemoryAuditor
  ): Promise<TreeSitterParser> {
    runtimeReady ??= Parser.init();
    await runtimeReady;
    const language = await Parser.Language.load(grammar);
    const parser = new Parser();
    parser.setLanguage(language);
    return new TreeSitterParser(parser, auditor);
  }

  /**
   * Parses `source` and runs `visit` on the root node. The tree is always
   * deleted afterwards, including when `visit` throws.
   */
  withTree<T>(source: string, visit: (root: Parser.SyntaxNode) => T): T {
    if (this.disposed) throw new Error("TreeSitterParser used after dispose().");
    const tree = this.parser.parse(source);
    this.auditor.recordAlloc();
    try {
      return visit(tree.rootNode);
    } finally {
      tree.delete();
      this.auditor.recordDelete();
    }
  }

  /** Counts nodes and reports whether the parse contains syntax errors. */
  analyze(source: string): TreeSitterAnalysis {
    return this.withTree(source, (root) => ({
      nodeCount: root.descendantCount,
      hasErrors: root.hasError,
    }));
  }

  /** Releases the parser itself. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.parser.delete();
  }
}
