import type { InspectorTelemetry } from "../../adapter.ts";

// --- Constants ---
const HASH_PREFIX_LENGTH = 12;

// --- Formatters ---
/** First 12 characters of a SHA-256 hex digest, or a dash when there is none. */
export const shortHash = (hash: string | null): string => (hash === null ? "—" : hash.slice(0, HASH_PREFIX_LENGTH));

/** Where the last mutation stands: applied, rolled back, or none yet. */
export function mutationStatus(telemetry: InspectorTelemetry): string {
  if (telemetry.lastMutationId !== null) return "Applied";
  return telemetry.fingerprints.afterRollback === null ? "None yet" : "Rolled back";
}

/** Text of the verification badge, or null while no rollback has been checked. */
export function rollbackBadgeText(telemetry: InspectorTelemetry): string | null {
  const { rollbackVerified, fingerprints } = telemetry;
  if (rollbackVerified === null) return null;
  const prefix = shortHash(fingerprints.afterRollback);
  return rollbackVerified
    ? `Rollback verified: SHA-256 identical ${prefix}`
    : `Rollback mismatch: SHA-256 differs ${prefix}`;
}
