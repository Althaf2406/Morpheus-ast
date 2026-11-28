/**
 * Anonymous HTTP helpers for the repository fetcher. No Authorization header is ever sent.
 * Every failure is returned as a value.
 */

import type { GitHubFetchError } from "../contracts.js";

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GitHubFetchError };

export interface TreeBlob {
  readonly path: string;
  readonly size: number | null;
}

const RATE_LIMIT_MESSAGE =
  "GitHub is limiting anonymous requests right now. Wait a few minutes, or paste or upload your code instead.";
const NOT_FOUND_MESSAGE = "That repository was not found, or it is not public.";
const NETWORK_MESSAGE = "GitHub could not be reached. Check your connection and try again.";

export const FORMAT_ERROR: GitHubFetchError = {
  kind: "format",
  message: 'Enter a repository as "owner/name" or a https://github.com/owner/name URL.',
};

function failure(error: GitHubFetchError): { readonly ok: false; readonly error: GitHubFetchError } {
  return { ok: false, error };
}

function statusError(status: number): GitHubFetchError {
  if (status === 403 || status === 429) return { kind: "rate-limit", message: RATE_LIMIT_MESSAGE };
  if (status === 404) return { kind: "not-found", message: NOT_FOUND_MESSAGE };
  return { kind: "network", message: NETWORK_MESSAGE };
}

async function request(
  fetchFn: typeof fetch,
  url: string,
  read: (response: Response) => Promise<unknown>
): Promise<Outcome<unknown>> {
  try {
    const response = await fetchFn(url);
    if (!response.ok) return failure(statusError(response.status));
    return { ok: true, value: await read(response) };
  } catch {
    return failure({ kind: "network", message: NETWORK_MESSAGE });
  }
}

export function getJson(fetchFn: typeof fetch, url: string): Promise<Outcome<unknown>> {
  return request(fetchFn, url, (response) => response.json() as Promise<unknown>);
}

/** Text of one file, or null when the download fails for any reason. */
export async function getText(fetchFn: typeof fetch, url: string): Promise<string | null> {
  const outcome = await request(fetchFn, url, (response) => response.text());
  return outcome.ok && typeof outcome.value === "string" ? outcome.value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readDefaultBranch(json: unknown): string | null {
  return isRecord(json) && typeof json["default_branch"] === "string" && json["default_branch"] !== ""
    ? json["default_branch"]
    : null;
}

/** File entries of a git tree listing; entries of other types are dropped. */
export function readTreeBlobs(json: unknown): readonly TreeBlob[] | null {
  if (!isRecord(json) || !Array.isArray(json["tree"])) return null;
  const blobs: TreeBlob[] = [];
  for (const entry of json["tree"] as readonly unknown[]) {
    if (!isRecord(entry) || entry["type"] !== "blob" || typeof entry["path"] !== "string") continue;
    const size = entry["size"];
    blobs.push({ path: entry["path"], size: typeof size === "number" ? size : null });
  }
  return blobs;
}

export const MALFORMED_RESPONSE: GitHubFetchError = { kind: "network", message: NETWORK_MESSAGE };
