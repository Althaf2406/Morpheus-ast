import type { InspectorTelemetry } from "../../adapter.ts";
import { InspectorDiff } from "./InspectorDiff.tsx";
import { mutationStatus, rollbackBadgeText, shortHash } from "./inspectorFormat.ts";
import {
  BADGE_BAD, BADGE_OK, CLOSE, FACT, FACTS, FACT_NAME, FACT_VALUE, HEAD, PANEL, TITLE,
} from "./inspectorStyles.ts";

// --- Types ---
interface Props {
  readonly telemetry: InspectorTelemetry;
  readonly onClose: () => void;
}

// --- Component ---
/** Live Engine Inspector: what the last mutation changed, engine telemetry and the rollback proof. */
export function InspectorPanel({ telemetry, onClose }: Props) {
  const { lastDiff, fingerprints, lastFault } = telemetry;
  const badge = rollbackBadgeText(telemetry);
  const facts: readonly (readonly [string, string])[] = [
    ["File", lastDiff?.filePath ?? "—"],
    ["Function", telemetry.targetFunction ?? "—"],
    ["Mutation", mutationStatus(telemetry)],
    ["Active fault", lastFault?.faultType ?? "—"],
    ["Functions", String(telemetry.functionCount)],
    ["Edges", String(telemetry.edgeCount)],
    ["Findings", String(telemetry.findingCount)],
    ["SHA-256 before", shortHash(fingerprints.before)],
    ["SHA-256 mutated", shortHash(fingerprints.afterMutation)],
    ["SHA-256 rollback", shortHash(fingerprints.afterRollback)],
  ];
  return (
    <section id="sre-inspector" role="region" aria-label="Live Engine Inspector" style={PANEL}>
      <header style={HEAD}>
        <h2 style={TITLE}>Live Engine Inspector</h2>
        <button type="button" className="sre-control" aria-label="Close inspector (I)" style={CLOSE} onClick={onClose}>
          ×
        </button>
      </header>
      <dl style={FACTS}>
        {facts.map(([name, value]) => (
          <div key={name} style={FACT}>
            <dt style={FACT_NAME}>{name}</dt>
            <dd style={FACT_VALUE}>{value}</dd>
          </div>
        ))}
      </dl>
      <div role="status">
        {badge !== null && <p style={telemetry.rollbackVerified === false ? BADGE_BAD : BADGE_OK}>{badge}</p>}
      </div>
      <InspectorDiff diff={lastDiff} />
    </section>
  );
}
