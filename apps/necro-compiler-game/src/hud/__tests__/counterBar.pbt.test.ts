import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialSpellState, spellReducer, type SpellState } from "../../spells/spellState.ts";
import { CounterBar } from "../CounterBar.tsx";
import { countMonsters } from "../counters.ts";

// --- Generators ---
type Op = { readonly kind: "CAST"; readonly index: number } | { readonly kind: "UNDO" };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant("CAST" as const), index: fc.nat(30) }),
  fc.constant<Op>({ kind: "UNDO" })
);

const outcome = { mutationId: "m", filePath: "f.ts", splicesApplied: 1 };

// --- Transition helpers ---
const castOf = (state: SpellState, entityId: string): SpellState => {
  const started = spellReducer(state, { type: "CAST_START", entityId });
  return spellReducer(started, { type: "CAST_SUCCESS", entityId, title: "t", outcome });
};

const undoOf = (state: SpellState): SpellState =>
  spellReducer(spellReducer(state, { type: "UNDO_START" }), { type: "UNDO_SUCCESS" });

const textOf = (alive: number, total: number, purified: number): string =>
  renderToStaticMarkup(createElement(CounterBar, { aliveCount: alive, totalCount: total, purifiedCount: purified }));

/**
 * **Feature: necro-visual-polish, Property 20: Monster_Counter and Purified_Counter move together and sum correctly**
 * **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7**
 */
describe("CounterBar counters (Property 20)", () => {
  it("keeps X + purified = Y, moves both in lockstep and renders the expected text", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.array(opArb, { maxLength: 40 }), (total, ops) => {
        const ids = Array.from({ length: total }, (_, i) => `e-${i}`);
        let state = initialSpellState;
        let before = countMonsters(total, state.states);
        for (const op of ops) {
          state = op.kind === "CAST" ? castOf(state, ids[op.index % total] ?? "e-0") : undoOf(state);
          const after = countMonsters(total, state.states);
          const delta = after.purifiedCount - before.purifiedCount;
          expect(Math.abs(delta)).toBeLessThanOrEqual(1);
          expect(after.aliveCount - before.aliveCount).toBe(0 - delta);
          expect(after.aliveCount + after.purifiedCount).toBe(after.totalCount);
          expect(after.totalCount).toBe(total);
          const html = textOf(after.aliveCount, after.totalCount, after.purifiedCount);
          expect(html).toContain(`Monsters ${after.aliveCount} / ${total}`);
          expect(html).toContain(`Purified ${after.purifiedCount}`);
          expect(html).not.toContain("Vulnerable");
          before = after;
        }
      }),
      { numRuns: 100 }
    );
  });

  it("counts a dying monster as alive", () => {
    const dying = spellReducer(initialSpellState, { type: "CAST_START", entityId: "e-0" });
    expect(countMonsters(3, dying.states)).toEqual({ aliveCount: 3, totalCount: 3, purifiedCount: 0 });
  });
});
