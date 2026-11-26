/**
 * Integration test: real engine behind the real adapter, no mocks (node environment).
 *
 * Evidence for TASK-NC-10: a cast produces a non-empty diff and fingerprints, and after undo
 * the SHA-256 of the file is identical to the one taken before the cast.
 */
import { describe, expect, it } from "vitest";
import { createNecroAdapter } from "../../adapter.ts";

const ZOMBIE_PREFIX = "Unused variable: ";

/** SHA-256 hex computed here, independently of the engine's own fingerprint function. */
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("inspector telemetry on the real engine", () => {
  it("cast -> non-empty diff -> undo -> fingerprint identical to before the cast", async () => {
    const adapter = createNecroAdapter();
    const layout = await adapter.loadSampleRepository();
    const room = layout.rooms.find((r) => r.entities.some((e) => e.title.startsWith(ZOMBIE_PREFIX) && e.suggestedSpell !== null));
    const spell = room?.entities.find((e) => e.title.startsWith(ZOMBIE_PREFIX) && e.suggestedSpell !== null)?.suggestedSpell;
    expect(room).toBeDefined();
    expect(spell).toBeDefined();
    const original = adapter.getSourceText(room!.filePath)!;

    expect(adapter.getTelemetry().lastDiff).toBeNull();
    await adapter.castSpell(spell!);

    const cast = adapter.getTelemetry();
    expect(cast.lastDiff?.filePath).toBe(room!.filePath);
    expect(cast.lastDiff?.hunks.length).toBeGreaterThan(0);
    expect(cast.lastDiff?.hunks[0]?.lines.some((l) => l.kind === "removed" || l.kind === "added")).toBe(true);
    expect(cast.targetFunction).toBe(room!.functionName);
    expect(cast.fingerprints.before).toBe(await sha256(original));
    expect(cast.fingerprints.afterMutation).toBe(await sha256(adapter.getSourceText(room!.filePath)!));
    expect(cast.fingerprints.afterMutation).not.toBe(cast.fingerprints.before);
    expect(cast.fingerprints.afterRollback).toBeNull();
    expect(cast.rollbackVerified).toBeNull();

    await adapter.rollbackLastSpell();

    const undone = adapter.getTelemetry();
    expect(undone.fingerprints.afterRollback).toBe(undone.fingerprints.before);
    expect(undone.fingerprints.afterRollback).toBe(await sha256(adapter.getSourceText(room!.filePath)!));
    expect(undone.rollbackVerified).toBe(true);
    expect(undone.lastDiff?.hunks.length).toBeGreaterThan(0);
  });
});
