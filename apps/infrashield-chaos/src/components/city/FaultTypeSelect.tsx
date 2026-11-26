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
const SELECT_STYLE: React.CSSProperties = {
  padding:       "10px 12px",
  fontFamily:    "monospace",
  fontSize:      "0.85rem",
  fontWeight:    700,
  letterSpacing: "0.04em",
  cursor:        "pointer",
  background:    "#051218",
  color:         "#00d4ff",
  border:        "2px solid #0088aa",
  borderRadius:  4,
};

// --- Narrowing ---
function isFaultType(raw: string): raw is FaultType {
  return FAULT_TYPES.some((type) => type === raw);
}

export function FaultTypeSelect({ value, onChange }: Props) {
  return (
    <select
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
  );
}
