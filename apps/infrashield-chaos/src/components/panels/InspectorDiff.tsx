import { useId, useState } from "react";
import type { DiffLine, MutationDiff } from "../../adapter.ts";
import {
  DIFF_BOX, DIFF_EMPTY, DIFF_TOGGLE, HUNK, HUNK_CAPTION, LINE_NO, LINE_SIGN, LINE_TEXT, REINDENT_MARK, ROW, SR_ONLY,
} from "./inspectorStyles.ts";
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
/** Line diff of the last mutation: removed red, added green; re-indented lines dim and shown once unless whitespace changes are on. */
export function InspectorDiff({ diff }: Props) {
  const [showWhitespace, setShowWhitespace] = useState(false);
  const toggleId = useId();
  const hunks = diff?.hunks ?? [];
  return (
    <div role="region" aria-label="Mutation diff" tabIndex={0} className="sre-control" style={DIFF_BOX}>
      {hunks.length === 0 ? (
        <p style={DIFF_EMPTY}>{diff === null ? "No mutation applied yet." : "The last mutation changed no line."}</p>
      ) : (
        <>
          <label htmlFor={toggleId} style={DIFF_TOGGLE}>
            <input
              id={toggleId}
              type="checkbox"
              checked={showWhitespace}
              onChange={(event) => setShowWhitespace(event.target.checked)}
            />{" "}
            Show whitespace changes
          </label>
          {hunks.map((hunk, h) => (
            <table style={HUNK} key={`${diff?.mutationId}-${h}`}>
              <caption style={HUNK_CAPTION}>
                @@ -{hunk.beforeStartLine},{hunk.beforeLineCount} +{hunk.afterStartLine},{hunk.afterLineCount} @@
              </caption>
              <tbody>
                {rowsOf(hunk.lines, showWhitespace).map((line, i) => (
                  <tr key={i} style={ROW[line.kind]}>
                    <td style={LINE_NO}>{line.beforeLine}</td>
                    <td style={LINE_NO}>{line.afterLine}</td>
                    <td style={LINE_SIGN}>
                      <span aria-hidden="true">{SIGN[line.kind].mark}</span>
                      <span style={SR_ONLY}>{SIGN[line.kind].label}</span>
                    </td>
                    <td style={LINE_TEXT}>
                      {line.text}
                      {line.kind === "reindent" && (
                        <span style={REINDENT_MARK} aria-hidden="true">
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
