/**
 * Property-based tests for the spell game reducer.
 *
 * **Validates: Requirements REQ-NC-006, REQ-NC-007**
 *
 *   P1 — No second spell starts while one is in flight
 *   P2 — A spell cannot start on a DYING or PURIFIED monster
 *   P3 — A failed cast always returns the monster to ALIVE
 *   P4 — Cast then undo restores the monster states
 *   P5 — Random cast/undo sequences keep the history consistent
 */
import * as fc from "fast-check";
import { describe, it, expect, expectTypeOf } from "vitest";
import type { NecroCompilerAdapter } from "../../adapter.ts";
import type { SpellCaster } from "../spellCaster.ts";
import {
  initialSpellState,
  spellReducer,
  visualStateOf,
  type SpellAction,
  type SpellOutcome,
  type SpellState,
} from "../spellState.ts";

const IDS = ["a", "b", "c"] as const;
const idArb = fc.constantFrom(...IDS);
const outcomeArb: fc.Arbitrary<SpellOutcome> = fc.record({
  mutationId: fc.string({ minLength: 1 }),
  filePath: fc.string({ minLength: 1 }),
  splicesApplied: fc.nat({ max: 5 }),
});
const actionArb: fc.Arbitrary<SpellAction> = fc.oneof(
  idArb.map((entityId): SpellAction => ({ type: "SELECT", entityId })),
  idArb.map((entityId): SpellAction => ({ type: "CAST_START", entityId })),
  fc.tuple(idArb, outcomeArb).map(([entityId, outcome]): SpellAction => ({ type: "CAST_SUCCESS", entityId, title: entityId, outcome })),
  fc.constant<SpellAction>({ type: "CAST_FAIL", message: "boom" }),
  fc.constant<SpellAction>({ type: "UNDO_START" }),
  fc.constant<SpellAction>({ type: "UNDO_SUCCESS" }),
  fc.constant<SpellAction>({ type: "UNDO_FAIL", message: "boom" }),
  fc.constant<SpellAction>({ type: "DISMISS_ERROR" })
);
const sequenceArb = fc.array(actionArb, { maxLength: 40 });
const run = (actions: readonly SpellAction[]): SpellState => actions.reduce(spellReducer, initialSpellState);

/** Visible monster states, with ALIVE as the default. */
const snapshot = (state: SpellState) => IDS.map((id) => visualStateOf(state, id));

function expectConsistent(state: SpellState): void {
  const { history, pending, undoableId } = state;
  history.forEach((entry, index) => expect(entry.id).toBe(index));
  for (const id of IDS) {
    const live = history.filter((e) => e.entityId === id && !e.undone);
    expect(live.length).toBeLessThanOrEqual(1);
    const visual = visualStateOf(state, id);
    if (visual === "PURIFIED") expect(live.length).toBe(1);
    else expect(live.length).toBe(0);
    if (visual === "DYING") expect(pending).toEqual({ kind: "CAST", entityId: id });
  }
  if (pending?.kind === "CAST") expect(visualStateOf(state, pending.entityId)).toBe("DYING");
  if (undoableId !== null) {
    expect(undoableId).toBe(history.length - 1);
    expect(history[undoableId]?.undone).toBe(false);
  }
  if (pending?.kind === "UNDO") expect(history[undoableId ?? -1]?.entityId).toBe(pending.entityId);
}

describe("spell reducer", () => {
  it("P1: no second spell starts while one is pending", () => {
    fc.assert(
      fc.property(sequenceArb, idArb, (actions, id) => {
        const state = run(actions);
        fc.pre(state.pending !== null);
        expect(spellReducer(state, { type: "CAST_START", entityId: id })).toBe(state);
        expect(spellReducer(state, { type: "UNDO_START" })).toBe(state);
      })
    );
  });

  it("P2: cast does not start on a DYING or PURIFIED monster", () => {
    fc.assert(
      fc.property(sequenceArb, idArb, (actions, id) => {
        const state = run(actions);
        fc.pre(visualStateOf(state, id) !== "ALIVE");
        expect(spellReducer(state, { type: "CAST_START", entityId: id })).toBe(state);
      })
    );
  });

  it("P3: a failed cast returns the monster to ALIVE", () => {
    fc.assert(
      fc.property(sequenceArb, idArb, (actions, id) => {
        const before = run(actions);
        fc.pre(before.pending === null && visualStateOf(before, id) === "ALIVE");
        const started = spellReducer(before, { type: "CAST_START", entityId: id });
        expect(visualStateOf(started, id)).toBe("DYING");
        const failed = spellReducer(started, { type: "CAST_FAIL", message: "boom" });
        expect(visualStateOf(failed, id)).toBe("ALIVE");
        expect(failed.pending).toBeNull();
        expect(failed.history).toEqual(before.history);
        expect(failed.undoableId).toBe(before.undoableId);
      })
    );
  });

  it("P4: cast then undo restores the monster states", () => {
    fc.assert(
      fc.property(sequenceArb, idArb, outcomeArb, (actions, id, outcome) => {
        const before = run(actions);
        fc.pre(before.pending === null && visualStateOf(before, id) === "ALIVE");
        const after = run([
          ...actions,
          { type: "CAST_START", entityId: id },
          { type: "CAST_SUCCESS", entityId: id, title: id, outcome },
          { type: "UNDO_START" },
          { type: "UNDO_SUCCESS" },
        ]);
        expect(snapshot(after)).toEqual(snapshot(before));
        expect(after.history.at(-1)?.undone).toBe(true);
      })
    );
  });

  it("undo clears the selection, since the rebuilt layout may use new entity ids", () => {
    fc.assert(
      fc.property(idArb, outcomeArb, (id, outcome) => {
        const after = run([
          { type: "SELECT", entityId: id },
          { type: "CAST_START", entityId: id },
          { type: "CAST_SUCCESS", entityId: id, title: id, outcome },
          { type: "UNDO_START" },
          { type: "UNDO_SUCCESS" },
        ]);
        expect(after.selectedId).toBeNull();
        expect(visualStateOf(after, id)).toBe("ALIVE");
      })
    );
  });

  it("P5: any action sequence keeps the history consistent", () => {
    fc.assert(
      fc.property(sequenceArb, (actions) => {
        let state = initialSpellState;
        for (const action of actions) {
          state = spellReducer(state, action);
          expectConsistent(state);
        }
      })
    );
  });

  it("the adapter satisfies SpellCaster structurally", () => {
    expectTypeOf<NecroCompilerAdapter>().toMatchTypeOf<SpellCaster>();
  });
});
