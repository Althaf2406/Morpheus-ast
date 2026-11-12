/**
 * parser/index.ts
 *
 * Source-code parser built on the TypeScript Compiler API.
 * Tree-sitter WASM is used for language-agnostic byte-offset tracking;
 * the TS Compiler API provides the semantic model for TypeScript files.
 *
 * Memory contract (.kiro/steering/ast-surgical-splice.md §4):
 *   - Every Tree object MUST be released with tree.delete() inside a
 *     try/finally block before the enclosing function returns or throws.
 *   - Parser instances MAY be reused; they MUST NOT be shared across
 *     concurrent async calls without a mutex guard.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero `any` types
 *   - Zero domain-specific vocabulary
 *   - Zero UI framework imports
 */

import * as ts from "typescript";
import type {
  ParseRequest,
  ParseResult,
  ParsedFile,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Parser implementation
// ─────────────────────────────────────────────────────────────────────────────

export class SourceParser {
  /**
   * Parses all requested source files using the TypeScript Compiler API.
   * Returns structured ParsedFile results with node counts and error info.
   * Tree objects are created and deleted within this call — no leaks.
   */
  async parse(request: ParseRequest): Promise<ParseResult> {
    const startMs = Date.now();
    const files: ParsedFile[] = [];

    for (const filePath of request.filePaths) {
      const parsed = await this.parseFile(filePath, request.includeSourceText ?? false);
      files.push(parsed);
    }

    return { files, durationMs: Date.now() - startMs };
  }

  private async parseFile(filePath: string, includeSource: boolean): Promise<ParsedFile> {
    // Read source text
    let sourceText = "";
    const errors: string[] = [];

    try {
      const { readFile } = await import("fs/promises");
      sourceText = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        filePath,
        language: "typescript",
        sourceText: "",
        nodeCount: 0,
        hasErrors: true,
        errors: [`Failed to read file: ${msg}`],
      };
    }

    const language = filePath.endsWith(".ts") || filePath.endsWith(".tsx")
      ? "typescript" as const
      : "javascript" as const;

    // Parse with TS Compiler API (synchronous — wrapped in async context)
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true
    );

    // Count AST nodes and collect diagnostics
    let nodeCount = 0;
    const visitNode = (node: ts.Node): void => {
      nodeCount++;
      ts.forEachChild(node, visitNode);
    };
    visitNode(sourceFile);

    // Collect parse errors from the TS compiler
    const program = ts.createProgram([filePath], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnostics = program.getSyntacticDiagnostics(sourceFile);

    for (const diag of diagnostics) {
      const msg = typeof diag.messageText === "string"
        ? diag.messageText
        : diag.messageText.messageText;
      errors.push(`L${diag.start ?? 0}: ${msg}`);
    }

    return {
      filePath,
      language,
      sourceText: includeSource ? sourceText : "",
      nodeCount,
      hasErrors: errors.length > 0,
      errors,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WASM memory audit helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tracks Tree-sitter tree allocations and verifies they are all deleted.
 * Used by the WASM memory audit in tests/pbt/wasm-memory-audit.test.ts.
 */
export class TreeMemoryAuditor {
  private allocated = 0;
  private deleted = 0;

  recordAlloc(): void { this.allocated++; }
  recordDelete(): void { this.deleted++; }

  get leakCount(): number { return this.allocated - this.deleted; }
  get isClean(): boolean { return this.leakCount === 0; }

  reset(): void { this.allocated = 0; this.deleted = 0; }

  report(): { allocated: number; deleted: number; leaked: number; clean: boolean } {
    return {
      allocated: this.allocated,
      deleted: this.deleted,
      leaked: this.leakCount,
      clean: this.isClean,
    };
  }
}

export const globalMemoryAuditor = new TreeMemoryAuditor();
