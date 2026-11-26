import type { DiffLine, MutationDiff } from "../../adapter.ts";

interface Props {
  readonly diff: MutationDiff | null;
}

const SIGN: Record<DiffLine["kind"], { readonly mark: string; readonly label: string }> = {
  context: { mark: " ", label: "unchanged" },
  removed: { mark: "-", label: "removed" },
  added: { mark: "+", label: "added" },
};

/** Coloured line diff of the last spell: removed lines red, added lines green, with line numbers. */
export function InspectorDiff({ diff }: Props) {
  const hunks = diff?.hunks ?? [];
  return (
    <div className="hud-diff" role="region" aria-label="Mutation diff" tabIndex={0}>
      {hunks.length === 0 ? (
        <p className="hud-empty">{diff === null ? "No spell cast yet." : "The last spell changed no line."}</p>
      ) : (
        hunks.map((hunk, h) => (
          <table className="hud-diff__hunk" key={`${diff?.mutationId}-${h}`}>
            <caption className="hud-code">
              @@ -{hunk.beforeStartLine},{hunk.beforeLineCount} +{hunk.afterStartLine},{hunk.afterLineCount} @@
            </caption>
            <tbody>
              {hunk.lines.map((line, i) => (
                <tr key={i} className={`hud-diff__row hud-diff__row--${line.kind}`}>
                  <td className="hud-diff__no">{line.beforeLine}</td>
                  <td className="hud-diff__no">{line.afterLine}</td>
                  <td className="hud-diff__sign">
                    <span aria-hidden="true">{SIGN[line.kind].mark}</span>
                    <span className="hud-sr-only">{SIGN[line.kind].label}</span>
                  </td>
                  <td className="hud-diff__text">{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))
      )}
    </div>
  );
}
