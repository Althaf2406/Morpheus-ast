// @vitest-environment node
/**
 * Feature: bring-your-own-code, Property 15: A repository switch clears all prior derived state
 *
 * Real engine, real sample repository, no mocks.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createInfraShieldAdapter } from "../adapter";
import type { InfraShieldAdapter, CandidateFile, FaultType } from "../adapter";

const FAULT_TYPES: readonly FaultType[] = ["UNCAUGHT_EXCEPTION", "LATENCY", "NETWORK_FAILURE", "EXTREME_PAYLOAD"];

/** Candidate files that each hold at least one function, so a load succeeds. */
const candidatesArb = fc
  .array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 3 })
  .map((extras): CandidateFile[] =>
    extras.map((n, i) => ({
      path: `src/mod${i}.ts`,
      content: `export function fn${i}(a: number): number {\n  const unused${n} = ${n};\n  return a + ${n};\n}\n`,
    }))
  );

/** Builds a non-empty combination of fault, patch and mutation state on the sample. */
async function buildState(adapter: InfraShieldAdapter, pick: number, faultType: FaultType, mutate: boolean): Promise<void> {
  const layout = await adapter.backToSample();
  const node = layout.nodes[pick % layout.nodes.length]!;
  await adapter.injectFault({ targetFunctionId: node.id, faultType });
  if (mutate) {
    await adapter.applyMutation({
      splices: [{ filePath: node.filePath, startIndex: 0, endIndex: 0, replacement: "// edit\n", description: "edit" }],
    });
  }
  // A mutation re-analyses the source, which drops the fault; the mutation itself is then the state.
  if (mutate) expect(adapter.getInspectorTelemetry().lastMutationId).not.toBeNull();
  else expect(adapter.getSREDashboard().lastFault).not.toBeNull();
}

async function expectCleared(adapter: InfraShieldAdapter): Promise<void> {
  const dash = adapter.getSREDashboard();
  const inspector = adapter.getInspectorTelemetry();
  expect(dash.lastFault).toBeNull();
  expect(dash.lastPatch).toBeNull();
  expect(inspector.lastFault).toBeNull();
  expect(inspector.lastMutationId).toBeNull();
  expect(inspector.lastDiff).toBeNull();
  expect(inspector.targetFunction).toBeNull();
  expect(inspector.fingerprints).toEqual({ before: null, afterMutation: null, afterRollback: null });
  expect(inspector.rollbackVerified).toBeNull();
  expect(adapter.getLayout().activeFault).toBeNull();
  // Nothing is left to roll back.
  await expect(adapter.rollbackLastMutation()).rejects.toThrow();
}

describe("Property 15: a repository switch clears all prior derived state", () => {
  const adapter = createInfraShieldAdapter();

  it("clears fault, patch and mutation state after a successful load", async () => {
    // **Validates: Requirements 5.6**
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10_000 }),
        fc.constantFrom(...FAULT_TYPES),
        fc.boolean(),
        candidatesArb,
        async (pick, faultType, mutate, candidates) => {
          await buildState(adapter, pick, faultType, mutate);
          const outcome = await adapter.loadFromCandidates(candidates);
          expect(outcome.ok).toBe(true);
          expect(adapter.isLoadedRepositoryActive()).toBe(true);
          await expectCleared(adapter);
        }
      ),
      { numRuns: 100 }
    );
  }, 300_000);

  it("clears fault, patch and mutation state after backToSample", async () => {
    // **Validates: Requirements 5.6**
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10_000 }),
        fc.constantFrom(...FAULT_TYPES),
        fc.boolean(),
        candidatesArb,
        async (pick, faultType, mutate, candidates) => {
          await adapter.loadFromCandidates(candidates);
          const layout = adapter.getLayout();
          const node = layout.nodes[pick % layout.nodes.length]!;
          await adapter.injectFault({ targetFunctionId: node.id, faultType });
          if (mutate) {
            await adapter.applyMutation({
              splices: [{ filePath: node.filePath, startIndex: 0, endIndex: 0, replacement: "// edit\n", description: "edit" }],
            });
          }
          await adapter.backToSample();
          expect(adapter.isLoadedRepositoryActive()).toBe(false);
          await expectCleared(adapter);
        }
      ),
      { numRuns: 100 }
    );
  }, 300_000);
});
