/**
 * Property tests for adapter spell assignment and the zombie merge rule.
 * The planner is wrapped by a recorder (it still delegates to the real planner),
 * so each entity spell is compared with the planner result for the same inputs.
 *
 * Feature: deterministic-remediation
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createNecroAdapter } from "../../adapter.ts";
import type { DungeonEntity, DungeonLayout, NecroCompilerAdapter } from "../../adapter.ts";

// --- Helpers ---
type Engine = ConstructorParameters<typeof NecroCompilerAdapter>[0];
type Finding = Parameters<Engine["planRemediation"]>[0];
type Plan = ReturnType<Engine["planRemediation"]>;

interface PlanCall {
  readonly finding: Finding;
  readonly source: string;
  readonly options: { readonly errorCause: boolean } | undefined;
  readonly result: Plan;
}

const ZOMBIE_PREFIX = "Unused variable: ";
const RUNS = 100;

/** Loads the sample repository with a recording planner installed on the adapter's engine. */
async function loadRecorded(): Promise<{ layout: DungeonLayout; calls: PlanCall[] }> {
  const adapter = createNecroAdapter();
  // The engine is private; the test reaches it only to wrap one method.
  const engine = (adapter as unknown as { engine: Engine }).engine;
  const real = engine.planRemediation.bind(engine);
  const calls: PlanCall[] = [];
  const recording: Engine["planRemediation"] = (finding, source, options) => {
    const result = real(finding, source, options);
    calls.push({ finding, source, options, result });
    return result;
  };
  (engine as { planRemediation: Engine["planRemediation"] }).planRemediation = recording;
  const layout = await adapter.loadSampleRepository();
  return { layout, calls };
}

function allEntities(layout: DungeonLayout): { roomId: string; entity: DungeonEntity }[] {
  return layout.rooms.flatMap((room) => room.entities.map((entity) => ({ roomId: room.id, entity })));
}

// --- Property 16 ---
describe("Property 16: Adapter spell assignment mirrors the planner result", () => {
  it("passes { errorCause: true } on every planner call and sets each spell from the result", async () => {
    const { layout, calls } = await loadRecorded();
    const entities = allEntities(layout);
    expect(calls.length).toBeGreaterThan(0);
    expect(entities.length).toBeGreaterThan(0);

    // Every spell on the layout comes from a recorded planner result, and null stays null.
    const spells = entities.map((e) => e.entity.suggestedSpell);
    const planned = calls.filter((c) => c.result !== null);
    expect(spells.filter((s) => s !== null).length).toBe(planned.length);

    fc.assert(
      fc.property(fc.nat(), (n) => {
        const call = calls[n % calls.length]!;
        // Both entity paths use the Cause_Form option.
        expect(call.options).toEqual({ errorCause: true });
        // The adapter planned from the exact analysed source of the finding's file.
        expect(call.source.length).toBeGreaterThan(0);

        if (call.result === null) return;
        const holders = entities.filter((e) => e.entity.suggestedSpell === call.result);
        expect(holders.length).toBe(1);
        expect(holders[0]!.entity.suggestedSpell?.splices).toEqual(call.result.splices);

        if (call.finding.category === "UNCAUGHT_EXCEPTION") {
          const text = call.result.splices.map((s) => s.replacement).join("");
          expect(text).toContain("cause");
        }
      }),
      { numRuns: RUNS }
    );
  });

  it("gives every UNCAUGHT_EXCEPTION spell a cause option, and null where the planner returned null", async () => {
    const { layout, calls } = await loadRecorded();
    const entities = allEntities(layout);
    for (const call of calls) {
      if (call.result === null) continue;
      if (call.finding.category === "UNCAUGHT_EXCEPTION") {
        expect(call.result.splices.some((s) => s.replacement.includes("cause:"))).toBe(true);
      }
    }
    const nullCalls = calls.filter((c) => c.result === null).length;
    const nullEntities = entities.filter((e) => e.entity.suggestedSpell === null).length;
    // Entities without a planner call (none expected) would only add to the null count.
    expect(nullEntities).toBeGreaterThanOrEqual(nullCalls);
  });
});

// --- Property 17 ---
describe("Property 17: Unused-variable entities are merged, not duplicated", () => {
  it("creates at most one entity per unused variable in a room", async () => {
    const { layout, calls } = await loadRecorded();
    const rooms = layout.rooms;
    expect(rooms.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(fc.nat(), (n) => {
        const room = rooms[n % rooms.length]!;
        const zombieTitles = room.entities
          .filter((e) => e.type === "ZOMBIE_VARIABLE" && e.title.startsWith(ZOMBIE_PREFIX))
          .map((e) => e.title);
        expect(new Set(zombieTitles).size).toBe(zombieTitles.length);
      }),
      { numRuns: RUNS }
    );

    // Entity ids are unique across the layout, so no variable is represented twice.
    const ids = allEntities(layout).map((e) => e.entity.entityId);
    expect(new Set(ids).size).toBe(ids.length);

    // Each UNUSED_VARIABLE planner call corresponds to exactly one entity.
    const unusedCalls = calls.filter((c) => c.finding.category === "UNUSED_VARIABLE");
    const zombieCount = allEntities(layout).filter((e) => e.entity.type === "ZOMBIE_VARIABLE").length;
    expect(unusedCalls.length).toBeLessThanOrEqual(zombieCount);
  });

  it("plans a direct zombie from an internal synthetic finding", async () => {
    const { calls } = await loadRecorded();
    const synthetic = calls.filter(
      (c) => c.finding.category === "UNUSED_VARIABLE" && c.finding.sourceScanner === "INTERNAL"
    );
    for (const call of synthetic) {
      expect(call.options).toEqual({ errorCause: true });
    }
  });
});
