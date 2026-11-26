import { CARD, HEADER, BTN_ACTIVE, BTN_DISABLED, DIM } from "./bugfixSpecStyles.ts";
// --- Types ---
interface Props {
  readonly hasPatch:       boolean;
  readonly isPatchApplied: boolean;
  readonly onApplyPatch:   () => void;
  readonly onRollback:     () => void;
}
// --- Component ---
export function PatchController({ hasPatch, isPatchApplied, onApplyPatch, onRollback }: Props) {
  const canApply    = hasPatch && !isPatchApplied;
  const canRollback = isPatchApplied;
  return (
    <div style={CARD}>
      <div style={HEADER}>Patch Controller</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={canApply ? BTN_ACTIVE : BTN_DISABLED} disabled={!canApply} onClick={onApplyPatch}>
          Apply Patch
        </button>
        <button style={canRollback ? BTN_ACTIVE : BTN_DISABLED} disabled={!canRollback} onClick={onRollback}>
          Rollback
        </button>
      </div>
      {!hasPatch && <div style={{ ...DIM, marginTop: 6 }}>No patch available yet.</div>}
    </div>
  );
}
