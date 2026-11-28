/**
 * Anonymous fetcher for public repositories. The `fetch` function is injected, no token is used,
 * and every expected failure is returned as a value.
 */

import type {
  CandidateFile,
  FetchGitHubRepository,
  ParseRepositoryRef,
  RepositoryRef,
  SkippedFile,
} from "../contracts.js";
import { MAX_FILE_BYTES, isEligiblePath, loadCode } from "./index.js";
import {
  FORMAT_ERROR,
  MALFORMED_RESPONSE,
  getJson,
  getText,
  readDefaultBranch,
  readTreeBlobs,
} from "./githubApi.js";

const PLAIN_REF = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;
const URL_REF =
  /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([^?#]+?))?\/?(?:[?#].*)?$/;
const DOWNLOAD_BATCH = 8;

interface ParsedRef extends RepositoryRef {
  readonly branch: string | null;
}

function parseRef(value: string): ParsedRef | null {
  const text = value.trim();
  const plain = PLAIN_REF.exec(text);
  if (plain?.[1] !== undefined && plain[2] !== undefined) {
    return { owner: plain[1], name: plain[2], branch: null };
  }
  const url = URL_REF.exec(text);
  if (url?.[1] !== undefined && url[2] !== undefined) {
    return { owner: url[1], name: url[2], branch: url[3] ?? null };
  }
  return null;
}

export const parseRepositoryRef: ParseRepositoryRef = (value) => {
  const parsed = parseRef(value);
  return parsed === null ? null : { owner: parsed.owner, name: parsed.name };
};

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function downloadAll(
  fetchFn: typeof fetch,
  rawBase: string,
  paths: readonly string[]
): Promise<readonly (string | null)[]> {
  const contents: (string | null)[] = [];
  for (let i = 0; i < paths.length; i += DOWNLOAD_BATCH) {
    const batch = paths.slice(i, i + DOWNLOAD_BATCH);
    contents.push(
      ...(await Promise.all(batch.map((p) => getText(fetchFn, `${rawBase}/${encodePath(p)}`))))
    );
  }
  return contents;
}

export const fetchGitHubRepository: FetchGitHubRepository = async (ref, fetchFn) => {
  const parsed = parseRef(ref);
  if (parsed === null) return { ok: false, error: FORMAT_ERROR };
  const repoPath = `${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`;

  let branch = parsed.branch;
  if (branch === null) {
    const repo = await getJson(fetchFn, `https://api.github.com/repos/${repoPath}`);
    if (!repo.ok) return repo;
    branch = readDefaultBranch(repo.value);
    if (branch === null) return { ok: false, error: MALFORMED_RESPONSE };
  }

  const treeUrl = `https://api.github.com/repos/${repoPath}/git/trees/${encodePath(branch)}?recursive=1`;
  const listing = await getJson(fetchFn, treeUrl);
  if (!listing.ok) return listing;
  const blobs = readTreeBlobs(listing.value);
  if (blobs === null) return { ok: false, error: MALFORMED_RESPONSE };

  const skipped: SkippedFile[] = [];
  const wanted: string[] = [];
  for (const { path, size } of blobs) {
    if (!isEligiblePath(path)) continue;
    if (size !== null && size > MAX_FILE_BYTES) skipped.push({ path, reason: "file too large" });
    else wanted.push(path);
  }

  const rawBase = `https://raw.githubusercontent.com/${repoPath}/${encodePath(branch)}`;
  const contents = await downloadAll(fetchFn, rawBase, wanted);
  const candidates: CandidateFile[] = [];
  wanted.forEach((path, i) => {
    const content = contents[i];
    if (typeof content === "string") candidates.push({ path, content });
    else skipped.push({ path, reason: "download failed" });
  });

  const loaded = loadCode(candidates);
  const merged = [...loaded.skipped, ...skipped].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0
  );
  return {
    ok: true,
    result: {
      files: loaded.files,
      skipped: merged,
      summary: { ...loaded.summary, skippedCount: merged.length },
    },
  };
};
