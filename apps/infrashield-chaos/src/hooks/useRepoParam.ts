import { useCallback, useEffect, useRef, useState } from "react";
import type { InfraShieldAdapter } from "../adapter";

// --- Types ---
type ParamAdapter = Pick<InfraShieldAdapter, "parseRepositoryRef" | "loadFromGitHub">;

export interface RepoParam {
  /** The valid ?repo value to pre-fill and load on start; null once consumed or when absent/invalid. */
  readonly pendingRepo: string | null;
  /** The plain-English format error for an invalid ?repo value. */
  readonly formatError: string | null;
  /** Ends the start-up load: the dialog no longer pre-fills or auto-starts. */
  readonly consume: () => void;
  /** Sets ?repo=owner/name after a successful GitHub load. */
  readonly setParam: (ref: string) => void;
  /** Removes ?repo from the address bar. */
  readonly clearParam: () => void;
}

// --- Helpers ---
function readParam(): string | null {
  const value = new URLSearchParams(window.location.search).get("repo");
  return value === null || value.trim() === "" ? null : value.trim();
}

function replaceSearch(repo: string | null): void {
  const params = new URLSearchParams(window.location.search);
  params.delete("repo");
  const parts = [params.toString(), repo === null ? "" : `repo=${repo}`].filter((p) => p !== "");
  const search = parts.length === 0 ? "" : `?${parts.join("&")}`;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
}

// --- Hook ---
/** Reads ?repo once on mount and keeps the address bar in step with the active repository. */
export function useRepoParam(adapter: ParamAdapter): RepoParam {
  const [raw] = useState(readParam);
  const [valid] = useState(() => raw !== null && adapter.parseRepositoryRef(raw) !== null);
  const [pendingRepo, setPending] = useState<string | null>(valid ? raw : null);
  const [formatError, setFormatError] = useState<string | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (raw === null || valid || checked.current) return;
    checked.current = true; // StrictMode runs effects twice
    void adapter.loadFromGitHub(raw).then((outcome) => {
      if (!outcome.ok) setFormatError(outcome.message);
    });
  }, [adapter, raw, valid]);

  const consume = useCallback(() => setPending(null), []);
  const setParam = useCallback((ref: string): void => {
    const parsed = adapter.parseRepositoryRef(ref);
    if (parsed !== null) replaceSearch(`${parsed.owner}/${parsed.name}`);
  }, [adapter]);
  const clearParam = useCallback(() => replaceSearch(null), []);

  return { pendingRepo, formatError, consume, setParam, clearParam };
}
