import type { CityNode } from "../../adapter.ts";
// --- Types ---
interface Props {
  readonly functionId: string;
  readonly nodesById: ReadonlyMap<string, CityNode>;
}
// --- Styles ---
const NAME: React.CSSProperties = { color: "#e6edf3", wordBreak: "break-all" };
const FILE: React.CSSProperties = { color: "#6e7681", fontSize: "0.66rem", wordBreak: "break-all" };
// --- Component ---
/** Function name with its file in a dimmer colour; falls back to the raw id for an unknown node. */
export function FunctionRef({ functionId, nodesById }: Props) {
  const node = nodesById.get(functionId);
  if (node === undefined) return <span style={NAME}>{functionId}</span>;
  return (
    <>
      <span style={NAME}>{node.name}</span>
      <span style={FILE}> {node.filePath}</span>
    </>
  );
}
