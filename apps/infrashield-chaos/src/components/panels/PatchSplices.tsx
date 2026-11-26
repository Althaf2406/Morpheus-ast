import type { SREDashboardData } from "../../adapter.ts";
import { groupSplices } from "./spliceGroups.ts";
// --- Types ---
type Patch = NonNullable<SREDashboardData["lastPatch"]>;
interface Props {
  readonly splices: Patch["suggestedSplices"];
  /** Characters of replacement code revealed so far, counted across the code splices in order. */
  readonly revealed: number;
}
// --- Styles ---
const ITEM: React.CSSProperties = { marginTop: 8 };
const META: React.CSSProperties = { fontSize: "0.68rem", color: "#8b949e", wordBreak: "break-all" };
const CODE_BOX: React.CSSProperties = {
  background:   "#010409",
  border:       "1px solid #21262d",
  borderRadius: 4,
  padding:      "8px 10px",
  marginTop:    4,
  fontSize:     "0.68rem",
  color:        "#e6edf3",
  whiteSpace:   "pre-wrap",
  overflowWrap: "anywhere",
  maxHeight:    160,
  overflowY:    "auto",
  lineHeight:   1.5,
};
// --- Component ---
/** Each code splice as file, byte range and description, then its replacement code; whitespace-only splices as one summary line. */
export function PatchSplices({ splices, revealed }: Props) {
  let remaining = revealed;
  return (
    <>
      {groupSplices(splices).map((item, i) => {
        if (item.kind === "whitespace") {
          return (
            <div key={`whitespace-${i}`} style={{ ...META, ...ITEM }}>
              {item.summary}
            </div>
          );
        }
        const { splice, index } = item;
        const shown = splice.replacement.slice(0, Math.max(remaining, 0));
        remaining -= splice.replacement.length;
        const isTyping = shown.length < splice.replacement.length;
        return (
          <div key={`${splice.filePath}-${splice.startIndex}-${i}`} style={ITEM}>
            <div style={META}>
              <span style={{ color: "#c9d1d9" }}>{splice.filePath}</span>{" "}
              [{splice.startIndex}, {splice.endIndex})
            </div>
            <div style={META}>{splice.description}</div>
            <div style={CODE_BOX} aria-label={`Replacement code ${index + 1}`}>
              {shown}
              {isTyping && shown.length > 0 && <span aria-hidden="true">▌</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}
