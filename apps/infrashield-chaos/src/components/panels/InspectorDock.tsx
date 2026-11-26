import type { InspectorTelemetry } from "../../adapter.ts";
import { InspectorPanel } from "./InspectorPanel.tsx";
import { DOCK, KBD, TOGGLE } from "./inspectorStyles.ts";

// --- Types ---
interface Props {
  readonly open: boolean;
  readonly telemetry: InspectorTelemetry | null;
  readonly onToggle: () => void;
}

// --- Component ---
/** Under the fault toolbar: the toggle button, and the inspector panel when it is open. */
export function InspectorDock({ open, telemetry, onToggle }: Props) {
  return (
    <div style={DOCK}>
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
      {open && telemetry !== null && <InspectorPanel telemetry={telemetry} onClose={onToggle} />}
    </div>
  );
}
