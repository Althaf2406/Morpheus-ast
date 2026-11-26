// @vitest-environment node
/**
 * Property 9: Apply then rollback restores the Virtual_Copy byte-for-byte.
 *
 * Runs against the real engine and the real sample repository (no mocks).
 * The virtual source text is read through the adapter's `getSourceText` accessor.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { createInfraShieldAdapter } from "../adapter";
import type { InfraShieldAdapter, CyberCityLayout } from "../adapter";
import type { SpliceRange } from "../../../../packages/morpheus-ast-core/src/contracts.js";

const FAULT_TYPES = ["UNCAUGHT_EXCEPTION", "LATENCY", "NETWORK_FAILURE", "EXTREME_PAYLOAD"] as const;

function readSource(adapter: InfraShieldAdapter, filePath: string): string {
  const text = adapter.getSourceText(filePath);
  if (text === undefined) throw new Error(`file not loaded: ${filePath}`);
  return text;
}

describe("Property 9: apply then rollback restores the Virtual_Copy", () => {
  const adapter = createInfraShieldAdapter();
  let layout: CyberCityLayout;

  beforeAll(async () => {
    layout = await adapter.loadSampleRepository();
  });

  it("restores the file for patches planned from a random fault", async () => {
    // **Validates: Requirements 7.5**
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 10_000 }),
        fc.constantFrom(...FAULT_TYPES),
        async (pick, faultType) => {
          await adapter.reset();
          const node = layout.nodes[pick % layout.nodes.length]!;
          await adapter.injectFault({ targetFunctionId: node.id, faultType });
          const patch = adapter.getSREDashboard().lastPatch;
          if (patch === null || patch.suggestedSplices.length === 0) return; // no fix exists

          const filePath = patch.suggestedSplices[0]!.filePath;
          const before = readSource(adapter, filePath);

          await adapter.applyMutation({ splices: patch.suggestedSplices });
          await adapter.rollbackLastMutation();

          expect(readSource(adapter, filePath)).toBe(before);
        }
      ),
      { numRuns: 25 }
    );
  }, 120_000);

  it("restores the file for random non-overlapping splices", async () => {
    // **Validates: Requirements 7.5**
    const filePath = layout.nodes[0]!.filePath;
    await adapter.reset();
    const original = readSource(adapter, filePath);

    const spliceSet = fc
      .uniqueArray(fc.nat({ max: original.length }), { minLength: 2, maxLength: 6 })
      .chain((cuts) => {
        const sorted = [...cuts].sort((a, b) => a - b);
        const pairs: [number, number][] = [];
        for (let i = 0; i + 1 < sorted.length; i += 2) pairs.push([sorted[i]!, sorted[i + 1]!]);
        return fc.tuple(
          fc.constant(pairs),
          fc.array(fc.string({ maxLength: 12 }), { minLength: pairs.length, maxLength: pairs.length })
        );
      });

    await fc.assert(
      fc.asyncProperty(spliceSet, async ([pairs, texts]) => {
        await adapter.reset();
        const before = readSource(adapter, filePath);
        const splices: SpliceRange[] = pairs.map(([startIndex, endIndex], i) => ({
          filePath,
          startIndex,
          endIndex,
          replacement: texts[i]!,
          description: "random splice",
        }));

        await adapter.applyMutation({ splices });
        await adapter.rollbackLastMutation();

        expect(readSource(adapter, filePath)).toBe(before);
      }),
      { numRuns: 25 }
    );
  }, 120_000);
});
