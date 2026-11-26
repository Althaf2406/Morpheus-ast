import type { DungeonTelemetry } from "../../adapter.ts";
import { InspectorDiff } from "./InspectorDiff.tsx";
import { rollbackBadgeText, shortHash, spellStatus } from "./inspectorFormat.ts";

interface Props {
  readonly telemetry: DungeonTelemetry;
  readonly onClose: () => void;
}

/** Live Engine Inspector: what the last spell changed, engine telemetry and the rollback proof. */
export function InspectorPanel({ telemetry, onClose }: Props) {
  const { lastDiff, lastSpellCast, fingerprints, activeAISuggestion } = telemetry;
  const badge = rollbackBadgeText(telemetry);
  const facts: readonly (readonly [string, string])[] = [
    ["File", lastDiff?.filePath ?? "—"],
    ["Function", telemetry.targetFunction ?? "—"],
    ["Spell", spellStatus(telemetry)],
    ["Splices", lastSpellCast === null ? "—" : `${lastSpellCast.splicesApplied} in ${lastSpellCast.durationMs} ms`],
    ["Rooms", String(telemetry.roomCount)],
    ["Monsters", String(telemetry.entityCount)],
    ["Advisor", activeAISuggestion?.modelId ?? "—"],
    ["SHA-256 before", shortHash(fingerprints.before)],
    ["SHA-256 cast", shortHash(fingerprints.afterMutation)],
    ["SHA-256 undo", shortHash(fingerprints.afterRollback)],
  ];
  return (
    <section id="hud-inspector" className="hud-panel hud-inspector" role="region" aria-label="Live Engine Inspector">
      <header className="hud-inspector__head">
        <h2 className="hud-title">Live Engine Inspector</h2>
        <button type="button" className="hud-close" aria-label="Close inspector (I)" onClick={onClose}>
          ×
        </button>
      </header>
      <dl className="hud-inspector__facts">
        {facts.map(([name, value]) => (
          <div key={name} className="hud-inspector__fact">
            <dt>{name}</dt>
            <dd className="hud-code">{value}</dd>
          </div>
        ))}
      </dl>
      <div role="status">
        {badge !== null && (
          <p className={telemetry.rollbackVerified === false ? "hud-verify hud-verify--bad" : "hud-verify"}>{badge}</p>
        )}
      </div>
      <InspectorDiff diff={lastDiff} />
    </section>
  );
}
