import type { InfraShieldAdapter } from "../../adapter.ts";

// Derive BugfixSpec from the adapter's return type — no direct core import needed.
export type BugfixSpec = ReturnType<InfraShieldAdapter["generateBugfixSpec"]>;

// --- Pure helpers ---

/** Formats a BugfixSpec into human-readable monospace output. */
export function formatBugfixSpec(spec: BugfixSpec): string {
  const lines: string[] = [
    `# Bugfix Spec — ${spec.specId}`,
    `Title:    ${spec.title}`,
    `Function: ${spec.targetFunctionId}`,
    `File:     ${spec.filePath}`,
    `Fault:    ${spec.faultType}`,
    `Blast:    ${blastLabel(spec.blastRadiusScore)}`,
    ``,
    `## Current Behavior`,
    spec.currentBehavior,
    ``,
    `## Expected Behavior`,
    spec.expectedBehavior,
    ``,
    `## Unchanged Behavior`,
    spec.unchangedBehavior,
    ``,
    `## Fix Property`,
    spec.fixProperty,
    ``,
    `## Preservation Property`,
    spec.preservationProperty,
    ``,
    `## Suggested Splices (${spec.suggestedMutation.splices.length})`,
    ...spec.suggestedMutation.splices.map(
      (s: BugfixSpec["suggestedMutation"]["splices"][number], i: number) =>
        `  [${i + 1}] ${s.filePath} [${s.startIndex}–${s.endIndex}]\n` +
        `      ${s.description}`,
    ),
    ``,
    `Generated: ${new Date(spec.createdAt).toISOString()}`,
  ];
  return lines.join("\n");
}

/** Returns a labeled percentage string for a blast-radius score in [0, 1]. */
export function blastLabel(score: number): string {
  const pct = Math.min(100, Math.max(0, Math.round(score * 100)));
  if (pct >= 70) return `${pct}% (high)`;
  if (pct >= 30) return `${pct}% (medium)`;
  return `${pct}% (low)`;
}
