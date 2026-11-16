interface Props {
  readonly isActive: boolean;
  readonly onInject: () => void;
  readonly onReset: () => void;
}

const BASE_STYLE: React.CSSProperties = {
  position:   "absolute",
  top:        16,
  left:       16,
  padding:    "10px 18px",
  fontFamily: "monospace",
  fontSize:   "0.9rem",
  fontWeight: 700,
  cursor:     "pointer",
  border:     "2px solid",
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
      <button style={RESET_STYLE} onClick={onReset} type="button">
        ✕ Reset City
      </button>
    );
  }
  return (
    <button style={INJECT_STYLE} onClick={onInject} type="button">
      ⚡ Inject Fault
    </button>
  );
}
