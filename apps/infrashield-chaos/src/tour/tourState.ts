// Pure tour reducer: no DOM, no storage.
export interface TourState {
  readonly visible: boolean;
  readonly step: 1 | 2 | 3;
}

export type TourAction =
  | { readonly type: "START" }
  | { readonly type: "NEXT" }
  | { readonly type: "BACK" }
  | { readonly type: "DISMISS" };

export const INITIAL_TOUR_STATE: TourState = { visible: false, step: 1 };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "START":
      return { visible: true, step: 1 };
    case "DISMISS":
      return { visible: false, step: 1 };
    case "NEXT":
      if (!state.visible) return state;
      if (state.step === 3) return { visible: false, step: 1 };
      return { visible: true, step: state.step === 1 ? 2 : 3 };
    case "BACK":
      if (!state.visible || state.step === 1) return state;
      return { visible: true, step: state.step === 3 ? 2 : 1 };
  }
}
