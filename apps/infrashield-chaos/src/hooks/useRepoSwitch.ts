import { useCallback, useState } from "react";
import type { CandidateFile, CyberCityLayout, InfraShieldAdapter, LoadOutcome } from "../adapter";

// --- Types ---
type SwitchAdapter = Pick<
  InfraShieldAdapter,
  "loadFromCandidates" | "loadFromGitHub" | "backToSample" | "isLoadedRepositoryActive"
>;

export interface RepoSwitch {
  readonly dialogOpen: boolean;
  readonly isLoaded: boolean;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly load: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly loadGitHub: (ref: string) => Promise<LoadOutcome>;
  readonly backToSample: () => void;
  readonly error: string | null;
}

// --- Hook ---
/** Load dialog state plus repository switching; every switch is forwarded to `onSwitch`. */
export function useRepoSwitch(adapter: SwitchAdapter, onSwitch: (layout: CyberCityLayout) => void): RepoSwitch {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(adapter.isLoadedRepositoryActive());
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((outcome: LoadOutcome): LoadOutcome => {
    if (outcome.ok) {
      onSwitch(outcome.layout);
      setIsLoaded(adapter.isLoadedRepositoryActive());
      setError(null);
    }
    return outcome;
  }, [adapter, onSwitch]);

  const load = useCallback(
    async (candidates: readonly CandidateFile[]) => accept(await adapter.loadFromCandidates(candidates)),
    [adapter, accept],
  );
  const loadGitHub = useCallback(
    async (ref: string) => accept(await adapter.loadFromGitHub(ref)),
    [adapter, accept],
  );
  const backToSample = useCallback((): void => {
    adapter.backToSample().then(
      (layout) => { onSwitch(layout); setIsLoaded(adapter.isLoadedRepositoryActive()); setError(null); },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [adapter, onSwitch]);

  return {
    dialogOpen, isLoaded, error, load, loadGitHub, backToSample,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
  };
}
