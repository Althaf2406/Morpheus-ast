// @vitest-environment node
/**
 * Integration test: real engine behind the real adapter, no mocks.
 *
 * Applying the deterministic patch edits the in-memory Virtual_Copy of the
 * sample repository and rollback restores it byte for byte. Only the
 * deterministic patch is read, straight after injectFault resolves.
 *
 * **Validates: Requirements 6.8, 6.9, 6.11, 7.10**
 */
import { describe, expect, it } from "vitest";
import { createInfraShieldAdapter } from "../adapter.ts";
import type { CyberCityLayout, InfraShieldAdapter } from "../adapter.ts";

// --- Helpers ---
/** Injects UNCAUGHT_EXCEPTION on the first function that has a deterministic patch. */
async function injectOnPatchableFunction(
  adapter: InfraShieldAdapter,
  layout: CyberCityLayout
): Promise<{ targetFunctionId: string }> {
  for (const node of layout.nodes) {
    await adapter.injectFault({ targetFunctionId: node.id, faultType: "UNCAUGHT_EXCEPTION" });
    const { lastFault, lastPatch } = adapter.getSREDashboard();
    if (lastFault !== null && lastPatch !== null) return { targetFunctionId: lastFault.targetFunctionId };
  }
  throw new Error("no function in the sample repository has a deterministic patch");
}

// --- Apply then rollback on the real engine ---
describe("real engine: apply then rollback the deterministic patch", () => {
  it("changes the source on apply and restores it byte for byte on rollback", async () => {
    const adapter = createInfraShieldAdapter();
    const layout = await adapter.loadSampleRepository();
    await injectOnPatchableFunction(adapter, layout);

    const patch = adapter.getSREDashboard().lastPatch;
    expect(patch).not.toBeNull();
    expect(patch!.modelId).toBe("deterministic");
    expect(patch!.suggestedSplices.length).toBeGreaterThan(0);

    const filePath = patch!.suggestedSplices[0]!.filePath;
    const original = adapter.getSourceText(filePath);
    expect(original).toBeDefined();

    const faultBefore = adapter.getLayout().activeFault!;
    const result = await adapter.applyMutation({ splices: patch!.suggestedSplices });
    const mutated = adapter.getSourceText(filePath);
    expect(mutated).not.toBe(original);
    expect(mutated).toBe(result.mutatedSource);

    const applied = adapter.getLayout();
    expect(applied.activeFault).toBeNull();
    expect(
      applied.securityFindings.some(
        (f) => f.functionId === faultBefore.targetFunctionId && f.category === "UNCAUGHT_EXCEPTION"
      )
    ).toBe(false);

    await adapter.rollbackLastMutation();
    const back = adapter.getLayout().activeFault;
    expect(back).not.toBeNull();
    expect(back!.targetFunctionId).toBe(faultBefore.targetFunctionId);
    expect(back!.faultType).toBe(faultBefore.faultType);
    expect(back!.affectedNodes).toEqual(faultBefore.affectedNodes);
    expect(adapter.getSREDashboard().lastPatch).toEqual(patch);
    const restored = adapter.getSourceText(filePath);
    expect(restored).toBe(original);
    expect(Buffer.from(restored!, "utf8").equals(Buffer.from(original!, "utf8"))).toBe(true);
  });
});

// --- Download flow ---
describe("real engine: download flow (evidence for TASK-IS-13)", () => {
  it("TASK-IS-13: after a fault, generateBugfixFile returns bugfix.md naming the faulted function", async () => {
    const adapter = createInfraShieldAdapter();
    const layout = await adapter.loadSampleRepository();
    const target = layout.nodes[0]!;
    await adapter.injectFault({ targetFunctionId: target.id, faultType: "UNCAUGHT_EXCEPTION" });

    const { targetFunctionId } = adapter.getSREDashboard().lastFault!;
    const file = adapter.generateBugfixFile();
    expect(file.fileName).toBe("bugfix.md");
    expect(file.content).toContain(targetFunctionId);
  });
});
