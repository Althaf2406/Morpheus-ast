import { useCallback, useEffect, useReducer, useRef } from "react";
import { INITIAL_TOUR_STATE, tourReducer } from "./tourState";
import type { TourState } from "./tourState";
import { hasSeenTour, markTourSeen } from "./tourStorage";

export interface UseTourOptions {
  readonly hasRepoParam: boolean;
  readonly loadSummaryOpen: boolean;
}

export interface UseTourResult {
  readonly state: TourState;
  readonly next: () => void;
  readonly back: () => void;
  readonly skip: () => void;
  readonly replay: () => void;
}

export function useTour(appKey: "necro" | "infra", options: UseTourOptions): UseTourResult {
  const { hasRepoParam, loadSummaryOpen } = options;
  const [state, dispatch] = useReducer(tourReducer, INITIAL_TOUR_STATE);
  const autoStarted = useRef(false);
  const deferred = hasRepoParam && loadSummaryOpen;

  // Auto-start once, unless already seen or deferred behind the load summary.
  useEffect(() => {
    if (autoStarted.current || deferred) return;
    autoStarted.current = true;
    if (!hasSeenTour(appKey)) dispatch({ type: "START" });
  }, [appKey, deferred]);

  const skip = useCallback(() => {
    markTourSeen(appKey);
    dispatch({ type: "DISMISS" });
  }, [appKey]);

  const next = useCallback(() => {
    if (state.visible && state.step === 3) {
      markTourSeen(appKey);
      dispatch({ type: "DISMISS" });
      return;
    }
    dispatch({ type: "NEXT" });
  }, [appKey, state.visible, state.step]);

  const back = useCallback(() => dispatch({ type: "BACK" }), []);
  const replay = useCallback(() => dispatch({ type: "START" }), []);

  // Esc dismisses, only while the tour is visible.
  useEffect(() => {
    if (!state.visible) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.visible, skip]);

  return { state, next, back, skip, replay };
}
