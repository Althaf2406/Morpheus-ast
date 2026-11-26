/**
 * mutator/bugfix-generator.ts
 *
 * 1-Click Kiro Bugfix Spec Generator.
 *
 * Produces a Kiro-compliant BugfixSpec object (and its markdown serialisation)
 * from a FaultInjectionResult and an optional BedrockPatchSuggestion.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary
 *   - Zero `any` types
 *   - Zero UI framework imports
 */

import type {
  BugfixSpec,
  FaultInjectionResult,
  BedrockPatchSuggestion,
  TopologyGraph,
  MutationRequest,
  SpliceRange,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// BugfixSpecGenerator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps code in a fence longer than any run of backticks inside it, so text that came from a
 * model (or anywhere else) cannot close the block early and inject markdown.
 */
function fenced(code: string): string {
  const longest = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}typescript\n${code}\n${fence}`;
}

/** Collapses whitespace, including newlines, so text stays on one markdown line. */
function oneLine(text: string): string {
  return text.split(/\s+/).filter((part) => part.length > 0).join(" ");
}
/** A splice that only inserts whitespace: it adds no code and removes none. */
function isWhitespaceInsertion(splice: SpliceRange): boolean {
  return splice.startIndex === splice.endIndex && splice.replacement.length > 0 && splice.replacement.trim() === "";
}
/** One summary entry for all whitespace-only splices of one file. */
function whitespaceSummary(splices: readonly SpliceRange[]): string {
  const first = splices[0]!;
  const start = Math.min(...splices.map((s) => s.startIndex));
  const end = Math.max(...splices.map((s) => s.endIndex));
  const characters = splices.reduce((sum, s) => sum + s.replacement.length, 0);
  return (
    `### Whitespace-only splices: ${splices.length} insertion${splices.length === 1 ? "" : "s"}\n` +
    `- **File**: \`${first.filePath}\`\n` +
    `- **Range**: bytes \`[${start}, ${end})\` (${characters} whitespace characters inserted, no code added or removed)`
  );
}
/**
 * Splices with code are listed one by one and numbered. Whitespace-only insertions are merged
 * into one summary entry per file, placed where that file's first such splice stood.
 */
function renderSplices(splices: readonly SpliceRange[]): string {
  if (splices.length === 0) return "_No automated patch available. Manual intervention required._";
  const whitespaceByFile = new Map<string, SpliceRange[]>();
  for (const splice of splices) {
    if (!isWhitespaceInsertion(splice)) continue;
    const group = whitespaceByFile.get(splice.filePath);
    if (group === undefined) whitespaceByFile.set(splice.filePath, [splice]);
    else group.push(splice);
  }
  const entries: string[] = [];
  const summarised = new Set<string>();
  let number = 0;
  for (const splice of splices) {
    if (isWhitespaceInsertion(splice)) {
      if (summarised.has(splice.filePath)) continue;
      summarised.add(splice.filePath);
      entries.push(whitespaceSummary(whitespaceByFile.get(splice.filePath)!));
      continue;
    }
    number += 1;
    entries.push(
      `### Splice ${number}: ${oneLine(splice.description)}\n` +
        `- **File**: \`${splice.filePath}\`\n` +
        `- **Range**: bytes \`[${splice.startIndex}, ${splice.endIndex})\`\n` +
        "- **Replacement**:\n" +
        fenced(splice.replacement)
    );
  }
  return entries.join("\n\n");
}
export class BugfixSpecGenerator {
  /**
   * Generates a structured BugfixSpec from fault analysis results.
   * If a Bedrock patch suggestion is provided, it is embedded as the
   * suggested mutation.
   */
  generate(
    faultResult: FaultInjectionResult,
    graph: TopologyGraph,
    patch?: BedrockPatchSuggestion
  ): BugfixSpec {
    const specId = `bugfix-${faultResult.targetFunctionId}-${Date.now()}`;

    const targetFn = graph.functions.find(
      (f) => f.id === faultResult.targetFunctionId
    );
    const filePath = targetFn?.filePath ?? "unknown";
    const fnName = targetFn?.name ?? faultResult.targetFunctionId;
    const complexity = targetFn?.cyclomaticComplexity ?? 0;
    const blastPct = (faultResult.blastRadiusScore * 100).toFixed(1);
    const affectedCount = faultResult.affectedNodes.length;

    const currentBehavior = this.describeCurrentBehavior(faultResult, fnName, blastPct, affectedCount);
    const expectedBehavior = this.describeExpectedBehavior(faultResult, fnName);
    const unchangedBehavior = this.describeUnchangedBehavior(faultResult, complexity, fnName);

    const fixProperty = `parse(print(mutate(tree))) is syntactically valid — the patched source of "${fnName}" re-parses without errors after the surgical splice is applied.`;
    const preservationProperty = `rollback(mutate(tree)) === original — applying rollbackMutation() on the patch record restores the source byte-for-byte to its pre-patch state; no whitespace, comment, or logic outside the splice range changes.`;

    const suggestedMutation: MutationRequest = patch != null
      ? { splices: patch.suggestedSplices }
      : { splices: [] };

    return {
      specId,
      title: `[${faultResult.faultType}] ${fnName} — cascades to ${affectedCount} nodes (blast: ${blastPct}%)`,
      targetFunctionId: faultResult.targetFunctionId,
      filePath,
      currentBehavior,
      expectedBehavior,
      unchangedBehavior,
      fixProperty,
      preservationProperty,
      suggestedMutation,
      faultType: faultResult.faultType,
      blastRadiusScore: faultResult.blastRadiusScore,
      createdAt: Date.now(),
    };
  }

  /**
   * Serializes a BugfixSpec to Kiro-compliant markdown.
   * This is the content written to bugfix.md.
   */
  toMarkdown(spec: BugfixSpec): string {
    const date = new Date(spec.createdAt).toISOString().split("T")[0];
    const spliceSection = renderSplices(spec.suggestedMutation.splices);
    return `# Bugfix Spec: ${spec.title}

**Spec ID**: \`${spec.specId}\`
**Date**: ${date}
**File**: \`${spec.filePath}\`
**Function**: \`${spec.targetFunctionId}\`
**Fault Type**: \`${spec.faultType}\`
**Blast Radius Score**: ${(spec.blastRadiusScore * 100).toFixed(1)}%

---

## Current Behavior (Defect)

${spec.currentBehavior}

---

## Expected Behavior (Correct)

${spec.expectedBehavior}

---

## Unchanged Behavior / Preservation Properties (Regression Prevention)

${spec.unchangedBehavior}

---

## Property-Based Testing Invariants

### Fix Property (C → P)
${spec.fixProperty}

### Preservation / Round-Trip Property
${spec.preservationProperty}

---

## Suggested Surgical Mutation

${spliceSection}

---

_Generated by MORPHEUS-AST BugfixSpecGenerator — Kiroween 2026_
`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private text builders
  // ─────────────────────────────────────────────────────────────────────────

  private describeCurrentBehavior(
    r: FaultInjectionResult,
    fnName: string,
    blastPct: string,
    affectedCount: number
  ): string {
    const cascade = r.cascadePath
      .slice(0, 5)
      .map((s) => `\`${s.functionId}\` (${s.reason}, depth ${s.depth})`)
      .join(", ");
    const moreCascade = r.cascadePath.length > 5 ? `, … and ${r.cascadePath.length - 5} more` : "";

    switch (r.faultType) {
      case "UNCAUGHT_EXCEPTION":
        return (
          `The function \`${fnName}\` does not handle exceptions thrown by its call sites. ` +
          `When an exception propagates, it cascades through ${affectedCount} downstream nodes ` +
          `(${blastPct}% of the graph) with no recovery path. ` +
          (cascade.length > 0 ? `Cascade steps: ${cascade}${moreCascade}.` : "")
        );

      case "NETWORK_FAILURE":
        return (
          `The function \`${fnName}\` has no fallback or retry logic for network call failures. ` +
          `A network fault propagates through ${affectedCount} dependent nodes (${blastPct}% blast radius). ` +
          (cascade.length > 0 ? `Cascade: ${cascade}${moreCascade}.` : "")
        );

      case "LATENCY":
        return (
          `The function \`${fnName}\` has no timeout guard. Under elevated latency, ` +
          `all ${affectedCount} downstream callers (${blastPct}% blast radius) are blocked indefinitely. ` +
          `Betweenness centrality: ${r.centralityScore.toFixed(4)}.`
        );

      case "EXTREME_PAYLOAD":
        return (
          `The function \`${fnName}\` does not validate input payload size. ` +
          `An oversized payload can be passed through ${affectedCount} downstream nodes ` +
          `(${blastPct}% blast radius), including potential prototype-pollution sinks. ` +
          (r.taintPaths.length > 0
            ? `${r.taintPaths.length} taint paths detected.`
            : "")
        );
    }
  }

  private describeExpectedBehavior(
    r: FaultInjectionResult,
    fnName: string
  ): string {
    switch (r.faultType) {
      case "UNCAUGHT_EXCEPTION":
        return (
          `\`${fnName}\` wraps its volatile call sites in a try/catch block ` +
          `and either recovers gracefully or re-throws a typed error. ` +
          `Downstream callers receive a defined error type rather than an unhandled rejection.`
        );

      case "NETWORK_FAILURE":
        return (
          `\`${fnName}\` implements a retry strategy (e.g., exponential backoff) ` +
          `or a defined fallback return value when the network call fails. ` +
          `Callers receive a resolved promise in all reachable fault scenarios.`
        );

      case "LATENCY":
        return (
          `\`${fnName}\` wraps async network calls with an \`AbortController\` timeout. ` +
          `When the deadline is exceeded, it throws a \`TimeoutError\` rather than hanging, ` +
          `allowing callers to implement bounded-wait logic.`
        );

      case "EXTREME_PAYLOAD":
        return (
          `\`${fnName}\` validates input payload size at the entry point and throws ` +
          `a \`PayloadTooLargeError\` before passing data downstream. ` +
          `Object-merge operations downstream are guarded against prototype-pollution ` +
          `via allowlist-based property copying.`
        );
    }
  }

  private describeUnchangedBehavior(
    r: FaultInjectionResult,
    complexity: number,
    fnName: string
  ): string {
    return (
      `All existing functionality of \`${fnName}\` on the **happy path** remains unchanged. ` +
      `The function's Cyclomatic Complexity (${complexity}) does not increase by more than 2 units ` +
      `as a result of adding the guard. ` +
      `All callers not in the blast-radius set (${(100 - r.blastRadiusScore * 100).toFixed(1)}% of the graph) ` +
      `are unaffected by the patch. ` +
      `Return types and public API surface of \`${fnName}\` are preserved. ` +
      `No imports are added or removed outside the splice range.`
    );
  }
}
