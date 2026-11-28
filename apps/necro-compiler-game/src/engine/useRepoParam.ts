import { useCallback, useState } from "react";
import type { CandidateFile, LoadOutcome, NecroCompilerAdapter } from "../adapter.ts";
import type { Repository } from "./useRepository.ts";

export const REPO_FORMAT_ERROR =
  'The "repo" link parameter must look like owner/name, for example "octocat/hello-world". Showing the sample repository instead.';

interface InitialParam {
  /** Normalised `owner/name` from a valid `?repo=` value. */
  readonly repo: string | null;
  /** Plain-English format error for an invalid `?repo=` value. */
  readonly error: string | null;
}

function readParam(adapter: NecroCompilerAdapter): InitialParam {
  const value = new URLSearchParams(window.location.search).get("repo");
  if (value === null) return { repo: null, error: null };
  const ref = adapter.parseRepositoryRef(value);
  return ref === null ? { repo: null, error: REPO_FORMAT_ERROR } : { repo: `${ref.owner}/${ref.name}`, error: null };
}

/** Rewrites `?repo=` in place (no navigation, no new history entry); null removes it. */
function writeParam(repo: string | null): void {
  const params = new URLSearchParams(window.location.search);
  params.delete("repo");
  const others = params.toString();
  const query = [others, repo === null ? "" : `repo=${repo}`].filter((part) => part !== "").join("&");
  const { pathname, hash } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${query === "" ? "" : `?${query}`}${hash}`);
}

export interface RepoParam {
  /** Valid `?repo=` value read on mount, or null. */
  readonly initialRepo: string | null;
  readonly formatError: string | null;
  readonly load: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly loadGitHub: (ref: string) => Promise<LoadOutcome>;
  readonly backToSample: () => Promise<void>;
}

/** Reads `?repo=` once on mount and keeps the URL in step with the active repository. */
export function useRepoParam(adapter: NecroCompilerAdapter, repository: Repository): RepoParam {
  const [initial] = useState(() => readParam(adapter));
  const { load: baseLoad, loadGitHub: baseLoadGitHub, backToSample: baseBack } = repository;

  const load = useCallback(
    async (candidates: readonly CandidateFile[]) => {
      const outcome = await baseLoad(candidates);
      if (outcome.ok) writeParam(null);
      return outcome;
    },
    [baseLoad]
  );
  const loadGitHub = useCallback(
    async (ref: string) => {
      const outcome = await baseLoadGitHub(ref);
      const parsed = adapter.parseRepositoryRef(ref);
      if (outcome.ok && parsed !== null) writeParam(`${parsed.owner}/${parsed.name}`);
      return outcome;
    },
    [adapter, baseLoadGitHub]
  );
  const backToSample = useCallback(async () => {
    await baseBack();
    writeParam(null);
  }, [baseBack]);

  return { initialRepo: initial.repo, formatError: initial.error, load, loadGitHub, backToSample };
}
