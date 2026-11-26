import type { EntityVisualState } from "../entities/entityTransition.ts";
import type { SpellResult } from "./spellCaster.ts";

// --- Types ---
export type SpellOutcome = Pick<SpellResult, "mutationId" | "filePath" | "splicesApplied">;

/** One line of the Grimoire: a spell that was cast, and whether it was undone. */
export interface GrimoireEntry extends SpellOutcome {
  /** Index in the history; entries are never removed. */
  readonly id: number;
  readonly entityId: string;
  readonly title: string;
  readonly undone: boolean;
}

export interface PendingSpell {
  readonly kind: "CAST" | "UNDO";
  readonly entityId: string;
}

export interface SpellState {
  readonly selectedId: string | null;
  /** Visual state per entity; missing ids are ALIVE. */
  readonly states: ReadonlyMap<string, EntityVisualState>;
  readonly pending: PendingSpell | null;
  readonly history: readonly GrimoireEntry[];
  /** The adapter undoes only its last spell: the entry that Undo would restore. */
  readonly undoableId: number | null;
  readonly error: string | null;
}

export type SpellAction =
  | { readonly type: "SELECT"; readonly entityId: string | null }
  | { readonly type: "CAST_START"; readonly entityId: string }
  | { readonly type: "CAST_SUCCESS"; readonly entityId: string; readonly title: string; readonly outcome: SpellOutcome }
  | { readonly type: "CAST_FAIL"; readonly message: string }
  | { readonly type: "UNDO_START" }
  | { readonly type: "UNDO_SUCCESS" }
  | { readonly type: "UNDO_FAIL"; readonly message: string }
  | { readonly type: "DISMISS_ERROR" };

// --- Initial state and queries ---
export const initialSpellState: SpellState = {
  selectedId: null,
  states: new Map(),
  pending: null,
  history: [],
  undoableId: null,
  error: null,
};

export const visualStateOf = (state: SpellState, entityId: string): EntityVisualState =>
  state.states.get(entityId) ?? "ALIVE";

/** A spell can start only on a living monster, with a spell available, and nothing in flight. */
export const canCast = (state: SpellState, entityId: string, hasSpell: boolean): boolean =>
  hasSpell && state.pending === null && visualStateOf(state, entityId) === "ALIVE";

export const canUndo = (state: SpellState): boolean => state.pending === null && state.undoableId !== null;

// --- Reducer ---
const withVisual = (
  states: ReadonlyMap<string, EntityVisualState>,
  entityId: string,
  visual: EntityVisualState
): ReadonlyMap<string, EntityVisualState> => new Map(states).set(entityId, visual);

export function spellReducer(state: SpellState, action: SpellAction): SpellState {
  const { pending } = state;
  switch (action.type) {
    case "SELECT":
      return { ...state, selectedId: action.entityId };
    case "CAST_START":
      if (!canCast(state, action.entityId, true)) return state;
      return {
        ...state,
        pending: { kind: "CAST", entityId: action.entityId },
        states: withVisual(state.states, action.entityId, "DYING"),
        error: null,
      };
    case "CAST_SUCCESS": {
      if (pending?.kind !== "CAST" || pending.entityId !== action.entityId) return state;
      const entry: GrimoireEntry = {
        ...action.outcome,
        id: state.history.length,
        entityId: action.entityId,
        title: action.title,
        undone: false,
      };
      return {
        ...state,
        pending: null,
        states: withVisual(state.states, action.entityId, "PURIFIED"),
        history: [...state.history, entry],
        undoableId: entry.id,
      };
    }
    case "CAST_FAIL":
      if (pending?.kind !== "CAST") return state;
      return {
        ...state,
        pending: null,
        states: withVisual(state.states, pending.entityId, "ALIVE"),
        error: action.message,
      };
    case "UNDO_START": {
      const entry = state.undoableId === null ? undefined : state.history[state.undoableId];
      if (!canUndo(state) || entry === undefined) return state;
      return { ...state, pending: { kind: "UNDO", entityId: entry.entityId }, error: null };
    }
    case "UNDO_SUCCESS": {
      if (pending?.kind !== "UNDO" || state.undoableId === null) return state;
      return {
        ...state,
        pending: null,
        selectedId: null,
        states: withVisual(state.states, pending.entityId, "ALIVE"),
        history: state.history.map((e) => (e.id === state.undoableId ? { ...e, undone: true } : e)),
        undoableId: null,
      };
    }
    case "UNDO_FAIL":
      if (pending?.kind !== "UNDO") return state;
      return { ...state, pending: null, error: action.message };
    case "DISMISS_ERROR":
      return { ...state, error: null };
  }
}
