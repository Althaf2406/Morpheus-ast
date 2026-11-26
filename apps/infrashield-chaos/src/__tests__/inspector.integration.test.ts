// @vitest-environment node
/**
 * Integration test: real engine behind the real adapter, no mocks.
 *
 * A mutation produces a non-empty diff and fingerprints, and after rollback the SHA-256
 * of the file is identical to the one taken before the mutation.
 *
 * **Validates: TASK-IS-10**
 */
import { describe, expect, it } from "vitest";
import { createInfraShieldAdapter } from "../adapter.ts";

// --- Helpers ---
/** SHA-256 hex computed here, independently of the engine's own fingerprint function. */
async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Mutation, diff and rollback ---
describe("inspector telemetry on the real engine", () => {
  it("mutation -> non-empty diff -> rollback -> fingerprint identical to before the mutation", async () => {
    const adapter = createInfraShieldAdapter();
    const layout = await adapter.loadSampleRepository();
    expect(adapter.getInspectorTelemetry().lastDiff).toBeNull();

    let patchFile = "";
    for (const node of layout.nodes) {
      await adapter.injectFault({ targetFunctionId: node.id, faultType: "UNCAUGHT_EXCEPTION" });
      const patch = adapter.getSREDashboard().lastPatch;
      if (patch !== null && patch.suggestedSplices.length > 0) { patchFile = patch.suggestedSplices[0]!.filePath; break; }
    }
    expect(patchFile).not.toBe("");
    const original = adapter.getSourceText(patchFile)!;
    const patch = adapter.getSREDashboard().lastPatch!;

    await adapter.applyMutation({ splices: patch.suggestedSplices });
    const applied = adapter.getInspectorTelemetry();
    expect(applied.lastDiff?.filePath).toBe(patchFile);
    expect(applied.lastDiff?.hunks.length).toBeGreaterThan(0);
    expect(applied.lastDiff?.hunks[0]?.lines.some((l) => l.kind === "removed" || l.kind === "added")).toBe(true);
    expect(applied.targetFunction).not.toBeNull();
    expect(applied.fingerprints.before).toBe(await sha256(original));
    expect(applied.fingerprints.afterMutation).toBe(await sha256(adapter.getSourceText(patchFile)!));
    expect(applied.fingerprints.afterMutation).not.toBe(applied.fingerprints.before);
    expect(applied.fingerprints.afterRollback).toBeNull();
    expect(applied.rollbackVerified).toBeNull();

    await adapter.rollbackLastMutation();
    const rolledBack = adapter.getInspectorTelemetry();
    expect(rolledBack.fingerprints.afterRollback).toBe(rolledBack.fingerprints.before);
    expect(rolledBack.fingerprints.afterRollback).toBe(await sha256(original));
    expect(rolledBack.rollbackVerified).toBe(true);
    expect(rolledBack.lastDiff?.hunks.length).toBeGreaterThan(0);
  });
});
