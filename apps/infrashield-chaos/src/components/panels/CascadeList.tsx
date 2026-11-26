import { useState } from "react";
import type { CityNode, SREDashboardData } from "../../adapter.ts";
import { FunctionRef } from "./FunctionRef.tsx";
// --- Types ---
type Fault = NonNullable<SREDashboardData["lastFault"]>;
interface Props {
  readonly cascadePath: Fault["cascadePath"];
  readonly nodesById: ReadonlyMap<string, CityNode>;
}
// --- Constants ---
export const VISIBLE_CASCADE_STEPS = 5;
// --- Styles ---
const LIST: React.CSSProperties = { listStyle: "none", margin: "4px 0 0", padding: 0 };
const ITEM: React.CSSProperties = { marginTop: 2, lineHeight: 1.4 };
const TOGGLE: React.CSSProperties = {
  marginTop: 4, padding: "2px 0", background: "none", border: "none",
  color: "#58a6ff", fontFamily: "monospace", fontSize: "0.72rem", cursor: "pointer",
};
// --- Component ---
/** Cascade steps by function name; the first five show, the rest open on demand. */
export function CascadeList({ cascadePath, nodesById }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (cascadePath.length === 0) return <span style={{ color: "#e6edf3" }}> none</span>;
  const hidden = cascadePath.length - VISIBLE_CASCADE_STEPS;
  const steps = expanded ? cascadePath : cascadePath.slice(0, VISIBLE_CASCADE_STEPS);
  return (
    <div>
      <ol style={LIST}>
        {steps.map((step, i) => (
          <li key={`${step.functionId}-${i}`} style={ITEM}>
            <span style={{ color: "#6e7681" }}>{i + 1}. </span>
            <FunctionRef functionId={step.functionId} nodesById={nodesById} />
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <button type="button" className="sre-control" style={TOGGLE}
          aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      )}
    </div>
  );
}
