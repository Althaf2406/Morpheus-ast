import { useCallback, useRef, useState } from "react";
import type { LoadOutcome } from "../../adapter";
import { getAudioEngine } from "../../audio";

export type LoadSuccess = Extract<LoadOutcome, { readonly ok: true }>;

export type LoadDialogState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "success"; readonly outcome: LoadSuccess };

export interface LoadDialogApi {
  readonly state: LoadDialogState;
  /** Runs a load. Ignored while another load is in flight. */
  readonly run: (action: () => Promise<LoadOutcome>) => Promise<void>;
}

const UNEXPECTED = "Something went wrong while loading. Please try again.";

export function useLoadDialog(): LoadDialogApi {
  const [state, setState] = useState<LoadDialogState>({ status: "idle" });
  const busy = useRef(false);

  const run = useCallback(async (action: () => Promise<LoadOutcome>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setState({ status: "submitting" });
    try {
      const outcome = await action();
      setState(outcome.ok ? { status: "success", outcome } : { status: "error", message: outcome.message });
      if (outcome.ok) getAudioEngine().playLoadComplete();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error && error.message ? error.message : UNEXPECTED });
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, run };
}
