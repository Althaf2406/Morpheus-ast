// @vitest-environment node
/**
 * Feature: bring-your-own-code, Property 15: A repository switch clears all prior derived state
 *
 * Real engine, real sample repository, no mocks.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { createNecroAdapter } from "../adapter.ts";
import type { NecroCompilerAdapter, CandidateFile } from "../adapter.ts";

/** Candidate files that each hold at least one function, so a load succeeds. */
const candidatesArb = fc
  .array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 3 })
  .map((extras): CandidateFile[] =>
    extras.map((n, i) => ({
      path: `src/mod${i}.ts`,
      content: `export function fn${i}(a: number): number {\n  const unused${n} = ${n};\n  return a + ${n};\n}\n`,
    }))
  );

/** Casts one spell on the active repository, optionally undoing it, leaving history behind. */
async function buildState(adapter: NecroCompilerAdapter, pick: number, undo: boolean): Promise<void> {
  const rooms = adapter.buildDungeonLayout().rooms;
  const room = rooms[pick % rooms.length]!;
  await adapter.castSpell({
    splices: [{ filePath: room.filePath, startIndex: 0, endIndex: 0, replacement: "// edit\n", description: "edit" }],
  });
  if (undo) await adapter.rollbackLastSpell();
  const t = adapter.getTelemetry();
  expect(t.lastDiff).not.toBeNull();
  expect(t.lastSpellCast !== null || t.lastSpellRollback).toBe(true);
}

async function expectCleared(adapter: NecroCompilerAdapter): Promise<void> {
  const t = adapter.getTelemetry();
  expect(t.lastSpellCast).toBeNull();
  expect(t.lastSpellRollback).toBe(false);
  expect(t.activeAISuggestion).toBeNull();
  expect(t.lastDiff).toBeNull();
  expect(t.targetFunction).toBeNull();
  expect(t.fingerprints).toEqual({ before: null, afterMutation: null, afterRollback: null });
  expect(t.rollbackVerified).toBeNull();
  // Nothing is left to undo.
  await expect(adapter.rollbackLastSpell()).rejects.toThrow();
}

describe("Property 15: a repository switch clears all prior derived state", () => {
  const adapter = createNecroAdapter();

  it("clears spell history and inspector state after a successful load", async () => {
    // **Validates: Requirements 5.6**
    await adapter.loadSampleRepository();
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 10_000 }), fc.boolean(), candidatesArb, async (pick, undo, candidates) => {
        await adapter.backToSample();
        await buildState(adapter, pick, undo);
        const outcome = await adapter.loadFromCandidates(candidates);
        expect(outcome.ok).toBe(true);
        expect(adapter.isLoadedRepositoryActive()).toBe(true);
        await expectCleared(adapter);
      }),
      { numRuns: 100 }
    );
  }, 300_000);

  it("clears spell history and inspector state after backToSample", async () => {
    // **Validates: Requirements 5.6**
    await adapter.loadSampleRepository();
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: 10_000 }), fc.boolean(), candidatesArb, async (pick, undo, candidates) => {
        await adapter.loadFromCandidates(candidates);
        await buildState(adapter, pick, undo);
        await adapter.backToSample();
        expect(adapter.isLoadedRepositoryActive()).toBe(false);
        await expectCleared(adapter);
      }),
      { numRuns: 100 }
    );
  }, 300_000);
});
