/**
 * parser/index.ts
 *
 * Source-code parser built on the TypeScript Compiler API. It accepts files
 * from disk (`filePaths`) and in-memory files (`virtualFiles`), so the same
 * code path works in Node and in a browser bundle.
 *
 * Tree-sitter parsing lives in ./tree-sitter.ts, which releases every WASM tree
 * with tree.delete() in a finally block.
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
   * Parses every requested file (disk first, then virtual) and returns node
   * counts and syntax errors. `sourceText` is only filled in when
   * `request.includeSourceText` is true; the topology compiler needs it.
   */
  async parse(request: ParseRequest): Promise<ParseResult> {
    const startMs = Date.now();
    const includeSource = request.includeSourceText ?? false;
    const files: ParsedFile[] = [];

    for (const filePath of request.filePaths) {
      files.push(await this.parseFromDisk(filePath, includeSource));
    }
    for (const virtual of request.virtualFiles ?? []) {
      files.push(this.parseText(virtual.filePath, virtual.sourceText, includeSource));
    }

    return { files, durationMs: Date.now() - startMs };
  }

  private async parseFromDisk(filePath: string, includeSource: boolean): Promise<ParsedFile> {
    let sourceText: string;
    try {
      // Imported lazily so bundling for a browser does not pull in Node's fs.
      const { readFile } = await import("fs/promises");
      sourceText = await readFile(filePath, "utf-8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        filePath,
        language: languageOf(filePath),
        sourceText: "",
        nodeCount: 0,
        hasErrors: true,
        errors: [`Failed to read file: ${msg}`],
      };
    }
    return this.parseText(filePath, sourceText, includeSource);
  }

  private parseText(filePath: string, sourceText: string, includeSource: boolean): ParsedFile {
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true);

    let nodeCount = 0;
    const visitNode = (node: ts.Node): void => {
      nodeCount++;
      ts.forEachChild(node, visitNode);
    };
    visitNode(sourceFile);

    // transpileModule reports syntactic diagnostics only, and never touches the disk.
    const transpiled = ts.transpileModule(sourceText, {
      fileName: filePath,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    });
    const errors = (transpiled.diagnostics ?? []).map((diag) => {
      const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
      return `offset ${diag.start ?? 0}: ${message}`;
    });

    return {
      filePath,
      language: languageOf(filePath),
      sourceText: includeSource ? sourceText : "",
      nodeCount,
      hasErrors: errors.length > 0,
      errors,
    };
  }
}

function languageOf(filePath: string): ParsedFile["language"] {
  return filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript" : "javascript";
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree allocation auditor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counts Tree-sitter tree allocations and deletions. TreeSitterParser records
 * every real tree it creates and releases here, so `leakCount` is a live check.
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
