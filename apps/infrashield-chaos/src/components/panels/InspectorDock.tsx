import type { ReactNode } from "react";
import type { InspectorTelemetry } from "../../adapter.ts";
import { InspectorPanel } from "./InspectorPanel.tsx";
import { DOCK, KBD, TOGGLE } from "./inspectorStyles.ts";

// --- Types ---
interface Props {
  readonly open: boolean;
  readonly telemetry: InspectorTelemetry | null;
  readonly onToggle: () => void;
  /** Optional control rendered beside the toggle button. */
  readonly extra?: ReactNode;
}

// --- Component ---
/** Under the fault toolbar: the toggle button, and the inspector panel when it is open. */
export function InspectorDock({ open, telemetry, onToggle, extra }: Props) {
  return (
    <div style={DOCK}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="sre-control"
        style={TOGGLE}
        aria-expanded={open}
        aria-controls="sre-inspector"
        aria-keyshortcuts="I"
        onClick={onToggle}
      >
        <span>{open ? "Hide Inspector" : "Show Inspector"}</span>
        <kbd style={KBD} aria-hidden="true">I</kbd>
      </button>
      {extra}
      </div>
      {open && telemetry !== null && <InspectorPanel telemetry={telemetry} onClose={onToggle} />}
    </div>
  );
}
