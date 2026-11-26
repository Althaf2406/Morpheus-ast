import { useId, useState } from "react";
import type { DiffLine, MutationDiff } from "../../adapter.ts";
interface Props {
  readonly diff: MutationDiff | null;
}
/** A line as drawn: a core line, or one half of a re-indented line when whitespace changes are shown. */
type RowKind = DiffLine["kind"];
interface Row {
  readonly kind: RowKind;
  readonly text: string;
  readonly beforeLine: number | null;
  readonly afterLine: number | null;
}
const SIGN: Record<RowKind, { readonly mark: string; readonly label: string }> = {
  context: { mark: " ", label: "unchanged" },
  removed: { mark: "-", label: "removed" },
  added: { mark: "+", label: "added" },
  reindent: { mark: " ", label: "re-indented" },
};
/**
 * Rows of one hunk. Re-indented lines stay one row each; with `full` they become the removed and
 * added line they stand for, and each run of changed lines lists removed rows before added rows.
 */
function rowsOf(lines: readonly DiffLine[], full: boolean): readonly Row[] {
  if (!full) return lines;
  const rows: Row[] = [];
  let removed: Row[] = [];
  let added: Row[] = [];
  const flush = (): void => {
    rows.push(...removed, ...added);
    removed = [];
    added = [];
  };
  for (const line of lines) {
    if (line.kind === "context") {
      flush();
      rows.push(line);
    } else if (line.kind === "removed") {
      removed.push(line);
    } else if (line.kind === "added") {
      added.push(line);
    } else {
      removed.push({ kind: "removed", text: line.beforeText ?? "", beforeLine: line.beforeLine, afterLine: null });
      added.push({ kind: "added", text: line.text, beforeLine: null, afterLine: line.afterLine });
    }
  }
  flush();
  return rows;
}
/** Coloured line diff of the last spell. Re-indented lines are dimmed and shown once unless whitespace changes are on. */
export function InspectorDiff({ diff }: Props) {
  const [showWhitespace, setShowWhitespace] = useState(false);
  const toggleId = useId();
  const hunks = diff?.hunks ?? [];
  return (
    <div className="hud-diff" role="region" aria-label="Mutation diff" tabIndex={0}>
      {hunks.length === 0 ? (
        <p className="hud-empty">{diff === null ? "No spell cast yet." : "The last spell changed no line."}</p>
      ) : (
        <>
          <label className="hud-diff__toggle" htmlFor={toggleId}>
            <input
              id={toggleId}
              type="checkbox"
              checked={showWhitespace}
              onChange={(event) => setShowWhitespace(event.target.checked)}
            />{" "}
            Show whitespace changes
          </label>
          {hunks.map((hunk, h) => (
            <table className="hud-diff__hunk" key={`${diff?.mutationId}-${h}`}>
              <caption className="hud-code">
                @@ -{hunk.beforeStartLine},{hunk.beforeLineCount} +{hunk.afterStartLine},{hunk.afterLineCount} @@
              </caption>
              <tbody>
                {rowsOf(hunk.lines, showWhitespace).map((line, i) => (
                  <tr key={i} className={`hud-diff__row hud-diff__row--${line.kind}`}>
                    <td className="hud-diff__no">{line.beforeLine}</td>
                    <td className="hud-diff__no">{line.afterLine}</td>
                    <td className="hud-diff__sign">
                      <span aria-hidden="true">{SIGN[line.kind].mark}</span>
                      <span className="hud-sr-only">{SIGN[line.kind].label}</span>
                    </td>
                    <td className="hud-diff__text">
                      {line.text}
                      {line.kind === "reindent" && (
                        <span className="hud-diff__mark" aria-hidden="true">
                          {" "}↳ indent
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </>
      )}
    </div>
  );
}
