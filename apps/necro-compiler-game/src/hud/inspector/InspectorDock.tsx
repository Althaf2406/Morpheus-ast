import type { DungeonTelemetry } from "../../adapter.ts";
import { InspectorPanel } from "./InspectorPanel.tsx";

interface Props {
  readonly open: boolean;
  readonly telemetry: DungeonTelemetry | null;
  readonly onToggle: () => void;
}

/** Left column under the title: the toggle button, and the inspector panel when it is open. */
export function InspectorDock({ open, telemetry, onToggle }: Props) {
  return (
    <div className="hud-inspector-dock">
      <button
        type="button"
        className="hud-button hud-button--undo hud-inspector-toggle"
        aria-expanded={open}
        aria-controls="hud-inspector"
        aria-keyshortcuts="I"
        onClick={onToggle}
      >
        <span>{open ? "Hide Inspector" : "Show Inspector"}</span>
        <kbd className="hud-kbd" aria-hidden="true">I</kbd>
      </button>
      {open && telemetry !== null && <InspectorPanel telemetry={telemetry} onClose={onToggle} />}
    </div>
  );
}
