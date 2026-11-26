import type { DungeonTelemetry } from "../../adapter.ts";

const HASH_PREFIX_LENGTH = 12;

/** First 12 characters of a SHA-256 hex digest, or a dash when there is none. */
export const shortHash = (hash: string | null): string => (hash === null ? "—" : hash.slice(0, HASH_PREFIX_LENGTH));

/** Where the last spell stands: applied, undone, or not cast yet. */
export function spellStatus(telemetry: DungeonTelemetry): string {
  if (telemetry.lastSpellCast !== null) return "Applied";
  return telemetry.lastSpellRollback ? "Rolled back" : "None yet";
}

/** Text of the verification badge, or null while no undo has been checked. */
export function rollbackBadgeText(telemetry: DungeonTelemetry): string | null {
  const { rollbackVerified, fingerprints } = telemetry;
  if (rollbackVerified === null) return null;
  const prefix = shortHash(fingerprints.afterRollback);
  return rollbackVerified
    ? `Rollback verified: SHA-256 identical ${prefix}`
    : `Rollback mismatch: SHA-256 differs ${prefix}`;
}
