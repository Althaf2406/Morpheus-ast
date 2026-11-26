import type { SREDashboardData } from "../../adapter.ts";
// --- Types ---
type Patch = NonNullable<SREDashboardData["lastPatch"]>;
export type PatchSplice = Patch["suggestedSplices"][number];
/** A splice shown with its code block, or the one summary line that stands for all whitespace-only splices. */
export type SpliceItem =
  | { readonly kind: "code"; readonly splice: PatchSplice; readonly index: number }
  | { readonly kind: "whitespace"; readonly summary: string };
// --- Helpers ---
/** True for a splice that only inserts whitespace: it adds no code and removes none. */
export function isWhitespaceInsertion(splice: PatchSplice): boolean {
  return splice.startIndex === splice.endIndex && splice.replacement.length > 0 && splice.replacement.trim() === "";
}
/** "Re-indented 22 lines inside the try block"; the place is named only when every description names it. */
function summarise(splices: readonly PatchSplice[]): string {
  const count = splices.length;
  const inTryBlock = splices.every((s) => /\btry block\b/i.test(s.description));
  const indentOnly = splices.every((s) => /^[ \t]+$/.test(s.replacement));
  if (!indentOnly) return `Inserted whitespace at ${count} place${count === 1 ? "" : "s"}`;
  return `Re-indented ${count} line${count === 1 ? "" : "s"}${inTryBlock ? " inside the try block" : ""}`;
}
/** Code splices in order; all whitespace-only splices merged into one summary at the first one's position. */
export function groupSplices(splices: readonly PatchSplice[]): readonly SpliceItem[] {
  const whitespace = splices.filter(isWhitespaceInsertion);
  const items: SpliceItem[] = [];
  let index = 0;
  for (const splice of splices) {
    if (!isWhitespaceInsertion(splice)) {
      items.push({ kind: "code", splice, index });
      index += 1;
    } else if (items.every((item) => item.kind !== "whitespace")) {
      items.push({ kind: "whitespace", summary: summarise(whitespace) });
    }
  }
  return items;
}
/** Characters of code the card types out: whitespace-only splices are summarised, so they take no part. */
export function codeLength(splices: readonly PatchSplice[]): number {
  return splices.reduce((sum, s) => (isWhitespaceInsertion(s) ? sum : sum + s.replacement.length), 0);
}
