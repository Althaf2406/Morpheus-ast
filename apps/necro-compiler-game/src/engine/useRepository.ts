import { useCallback, useState } from "react";
import type { CandidateFile, DungeonLayout, LoadOutcome, NecroCompilerAdapter } from "../adapter.ts";

export interface Repository {
  readonly layout: DungeonLayout;
  /** Changes on every repository switch; use it as a React key to reset all per-repository UI state. */
  readonly version: number;
  /** True while a user-loaded repository (not the sample) is active. */
  readonly loaded: boolean;
  readonly load: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly loadGitHub: (ref: string) => Promise<LoadOutcome>;
  readonly backToSample: () => Promise<void>;
}

interface Snapshot {
  readonly layout: DungeonLayout;
  readonly version: number;
}

/** Tracks the active repository's layout and switches it through the adapter. */
export function useRepository(adapter: NecroCompilerAdapter, initialLayout: DungeonLayout): Repository {
  const [snapshot, setSnapshot] = useState<Snapshot>({ layout: initialLayout, version: 0 });

  const switchTo = useCallback((layout: DungeonLayout): void => {
    setSnapshot((previous) => ({ layout, version: previous.version + 1 }));
  }, []);

  const accept = useCallback(
    (outcome: LoadOutcome): LoadOutcome => {
      if (outcome.ok) switchTo(outcome.layout);
      return outcome;
    },
    [switchTo]
  );

  const load = useCallback(
    async (candidates: readonly CandidateFile[]) => accept(await adapter.loadFromCandidates(candidates)),
    [adapter, accept]
  );
  const loadGitHub = useCallback(
    async (ref: string) => accept(await adapter.loadFromGitHub(ref)),
    [adapter, accept]
  );
  const backToSample = useCallback(async () => switchTo(await adapter.backToSample()), [adapter, switchTo]);

  return {
    layout: snapshot.layout,
    version: snapshot.version,
    loaded: adapter.isLoadedRepositoryActive(),
    load,
    loadGitHub,
    backToSample,
  };
}
