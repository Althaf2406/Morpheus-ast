import { useCallback, useState } from "react";
import type { CandidateFile, LoadOutcome } from "../../adapter.ts";

// --- Types ---

export type LoadSuccess = Extract<LoadOutcome, { readonly ok: true }>;

export type LoadState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "success"; readonly outcome: LoadSuccess };

export interface UseLoadDialogOptions {
  readonly onLoad: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly onLoadGitHub: (ref: string) => Promise<LoadOutcome>;
}

export interface UseLoadDialog {
  readonly state: LoadState;
  readonly busy: boolean;
  /** Loads candidates produced asynchronously (e.g. read from File objects). */
  readonly loadFiles: (produce: () => Promise<readonly CandidateFile[]>) => void;
  readonly loadRepo: (ref: string) => void;
}

const UNEXPECTED = "Something went wrong while loading. Please try again.";

// --- Hook ---

export function useLoadDialog({ onLoad, onLoadGitHub }: UseLoadDialogOptions): UseLoadDialog {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const busy = state.status === "submitting";

  const run = useCallback((task: () => Promise<LoadOutcome>): void => {
    setState({ status: "submitting" });
    task().then(
      (outcome) =>
        setState(
          outcome.ok
            ? { status: "success", outcome }
            : { status: "error", message: outcome.message },
        ),
      (err: unknown) =>
        setState({ status: "error", message: err instanceof Error ? err.message : UNEXPECTED }),
    );
  }, []);

  const loadFiles = useCallback(
    (produce: () => Promise<readonly CandidateFile[]>): void => {
      if (busy) return;
      run(async () => onLoad(await produce()));
    },
    [busy, run, onLoad],
  );

  const loadRepo = useCallback(
    (ref: string): void => {
      if (busy) return;
      run(() => onLoadGitHub(ref.trim()));
    },
    [busy, run, onLoadGitHub],
  );

  return { state, busy, loadFiles, loadRepo };
}
