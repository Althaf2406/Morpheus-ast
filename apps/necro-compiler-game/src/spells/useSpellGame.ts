import { useCallback, useMemo, useReducer, useRef } from "react";
import type { DungeonLayout } from "../adapter.ts";
import { indexEntities, type EntityTarget } from "./entityIndex.ts";
import type { SpellCaster } from "./spellCaster.ts";
import {
  canCast,
  canUndo,
  initialSpellState,
  spellReducer,
  type SpellState,
} from "./spellState.ts";
import { useSpellKeys } from "./useSpellKeys.ts";

export interface SpellGame {
  readonly state: SpellState;
  readonly lookup: ReadonlyMap<string, EntityTarget>;
  readonly selected: EntityTarget | null;
  readonly castEnabled: boolean;
  readonly undoEnabled: boolean;
  readonly select: (entityId: string | null) => void;
  readonly cast: () => void;
  readonly undo: () => void;
  readonly dismissError: () => void;
}

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "The spell fizzled.";

/** Wires the pure spell reducer to a SpellCaster and the keyboard. */
export function useSpellGame(layout: DungeonLayout, caster: SpellCaster): SpellGame {
  const [state, dispatch] = useReducer(spellReducer, initialSpellState);
  const lookup = useMemo(() => indexEntities(layout), [layout]);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Set synchronously, so two quick key presses cannot both start a spell before React re-renders.
  const busyRef = useRef(false);

  const selected = state.selectedId === null ? null : lookup.get(state.selectedId) ?? null;
  const castEnabled =
    selected !== null && canCast(state, selected.entity.entityId, selected.entity.suggestedSpell !== null);
  const undoEnabled = canUndo(state);

  const select = useCallback((entityId: string | null) => dispatch({ type: "SELECT", entityId }), []);
  const dismissError = useCallback(() => dispatch({ type: "DISMISS_ERROR" }), []);

  const cast = useCallback(async () => {
    const current = stateRef.current;
    const target = current.selectedId === null ? undefined : lookup.get(current.selectedId);
    const spell = target?.entity.suggestedSpell ?? null;
    if (busyRef.current || target === undefined || spell === null) return;
    const { entityId, title } = target.entity;
    if (!canCast(current, entityId, true)) return;
    busyRef.current = true;
    dispatch({ type: "CAST_START", entityId });
    try {
      const result = await caster.castSpell(spell);
      dispatch({ type: "CAST_SUCCESS", entityId, title, outcome: result });
    } catch (error) {
      dispatch({ type: "CAST_FAIL", message: failureMessage(error) });
    } finally {
      busyRef.current = false;
    }
  }, [caster, lookup]);

  const undo = useCallback(async () => {
    if (busyRef.current || !canUndo(stateRef.current)) return;
    busyRef.current = true;
    dispatch({ type: "UNDO_START" });
    try {
      await caster.rollbackLastSpell();
      dispatch({ type: "UNDO_SUCCESS" });
    } catch (error) {
      dispatch({ type: "UNDO_FAIL", message: failureMessage(error) });
    } finally {
      busyRef.current = false;
    }
  }, [caster]);

  useSpellKeys({ onCast: cast, onUndo: undo, onCancel: () => select(null) });

  return { state, lookup, selected, castEnabled, undoEnabled, select, cast, undo, dismissError };
}
