interface Props {
  readonly isActive: boolean;
  readonly onInject: () => void;
  readonly onReset: () => void;
}

const BASE_STYLE: React.CSSProperties = {
  height:     36,
  padding:    "0 16px",
  fontFamily: "monospace",
  fontSize:   "0.85rem",
  fontWeight: 700,
  cursor:     "pointer",
  border:     "1px solid",
  borderRadius: 4,
  letterSpacing: "0.04em",
  transition:  "background 0.15s, color 0.15s",
};

const INJECT_STYLE: React.CSSProperties = {
  ...BASE_STYLE,
  background:   "#1a0505",
  color:        "#ff4444",
  borderColor:  "#ff2222",
};

const RESET_STYLE: React.CSSProperties = {
  ...BASE_STYLE,
  background:   "#051a0a",
  color:        "#00e5a0",
  borderColor:  "#00cc88",
};

export function InjectFaultButton({ isActive, onInject, onReset }: Props) {
  if (isActive) {
    return (
      <button className="sre-control" aria-label="Reset city" style={RESET_STYLE} onClick={onReset} type="button">
        ✕ Reset City
      </button>
    );
  }
  return (
    <button className="sre-control" aria-label="Inject fault" style={INJECT_STYLE} onClick={onInject} type="button">
      ⚡ Inject Fault
    </button>
  );
}
