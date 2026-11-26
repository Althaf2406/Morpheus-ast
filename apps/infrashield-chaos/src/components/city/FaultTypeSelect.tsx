import type { FaultType } from "../../adapter";

export const FAULT_TYPES: readonly FaultType[] = [
  "LATENCY",
  "NETWORK_FAILURE",
  "EXTREME_PAYLOAD",
  "UNCAUGHT_EXCEPTION",
];

interface Props {
  readonly value: FaultType;
  readonly onChange: (next: FaultType) => void;
}

// --- Styles ---
const SELECT_ID = "fault-type-select";
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const LABEL: React.CSSProperties = {
  fontSize:      "0.65rem",
  color:         "#8b949e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const SELECT_STYLE: React.CSSProperties = {
  height:        36,
  padding:       "0 10px",
  fontFamily:    "monospace",
  fontSize:      "0.8rem",
  letterSpacing: "0.04em",
  cursor:        "pointer",
  background:    "#0d1117",
  color:         "#c9d1d9",
  border:        "1px solid #30363d",
  borderRadius:  4,
};
// --- Narrowing ---
function isFaultType(raw: string): raw is FaultType {
  return FAULT_TYPES.some((type) => type === raw);
}

export function FaultTypeSelect({ value, onChange }: Props) {
  return (
    <div style={FIELD}>
      <label htmlFor={SELECT_ID} style={LABEL}>Fault type</label>
      <select
        id={SELECT_ID}
        className="sre-control"
        aria-label="Fault type"
        style={SELECT_STYLE}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (isFaultType(next)) onChange(next);
        }}
      >
        {FAULT_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </div>
  );
}
