import type { FaultType } from "../../adapter.ts";
import { FaultTypeSelect } from "./FaultTypeSelect.tsx";
import { InjectFaultButton } from "./InjectFaultButton.tsx";
// --- Types ---
interface Props {
  readonly faultType: FaultType;
  readonly onFaultTypeChange: (next: FaultType) => void;
  readonly isActive: boolean;
  readonly onInject: () => void;
  readonly onReset: () => void;
}
// --- Styles ---
const TOOLBAR: React.CSSProperties = {
  position:       "absolute",
  top:            16,
  left:           16,
  display:        "flex",
  alignItems:     "flex-end",
  gap:            12,
  padding:        "10px 12px",
  background:     "rgba(13, 17, 23, 0.92)",
  border:         "1px solid #30363d",
  borderRadius:   6,
  fontFamily:     "monospace",
};
// --- Component ---
/** Fault type picker and Inject/Reset action laid out as one row. */
export function FaultToolbar({ faultType, onFaultTypeChange, isActive, onInject, onReset }: Props) {
  return (
    <div role="toolbar" aria-label="Fault controls" style={TOOLBAR}>
      <FaultTypeSelect value={faultType} onChange={onFaultTypeChange} />
      <InjectFaultButton isActive={isActive} onInject={onInject} onReset={onReset} />
    </div>
  );
}
