import type { DiffLine, MutationDiff } from "../../adapter.ts";
import {
  DIFF_BOX, DIFF_EMPTY, HUNK, HUNK_CAPTION, LINE_NO, LINE_SIGN, LINE_TEXT, ROW, SR_ONLY,
} from "./inspectorStyles.ts";

// --- Types ---
interface Props {
  readonly diff: MutationDiff | null;
}

// --- Constants ---
const SIGN: Record<DiffLine["kind"], { readonly mark: string; readonly label: string }> = {
  context: { mark: " ", label: "unchanged" },
  removed: { mark: "-", label: "removed" },
  added: { mark: "+", label: "added" },
};

// --- Component ---
/** Line diff of the last mutation: removed red, added green, each marked with a sign and line numbers. */
export function InspectorDiff({ diff }: Props) {
  const hunks = diff?.hunks ?? [];
  return (
    <div role="region" aria-label="Mutation diff" tabIndex={0} className="sre-control" style={DIFF_BOX}>
      {hunks.length === 0 ? (
        <p style={DIFF_EMPTY}>{diff === null ? "No mutation applied yet." : "The last mutation changed no line."}</p>
      ) : (
        hunks.map((hunk, h) => (
          <table key={`${diff?.mutationId}-${h}`} style={HUNK}>
            <caption style={HUNK_CAPTION}>
              @@ -{hunk.beforeStartLine},{hunk.beforeLineCount} +{hunk.afterStartLine},{hunk.afterLineCount} @@
            </caption>
            <tbody>
              {hunk.lines.map((line, i) => (
                <tr key={i} style={ROW[line.kind]}>
                  <td style={LINE_NO}>{line.beforeLine}</td>
                  <td style={LINE_NO}>{line.afterLine}</td>
                  <td style={LINE_SIGN}>
                    <span aria-hidden="true">{SIGN[line.kind].mark}</span>
                    <span style={SR_ONLY}>{SIGN[line.kind].label}</span>
                  </td>
                  <td style={LINE_TEXT}>{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))
      )}
    </div>
  );
}
