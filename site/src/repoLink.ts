/**
 * Repo_Parser and App URL builder. Pure functions, no React, no DOM.
 */

export interface RepoSlug {
  readonly owner: string;
  readonly name: string;
}

/** Inline hint shown when a Repo_Reference is empty or invalid. */
export const REPO_FORMAT_HINT =
  "Enter a repository as owner/repo (for example expressjs/cors) or a github.com URL (https://github.com/owner/repo).";

const SEGMENT = /^[A-Za-z0-9._-]+$/;
const PLAIN_FORM = /^([^/\s]+)\/([^/\s]+)\/?$/;
const URL_FORM = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

function isValidSegment(segment: string): boolean {
  return SEGMENT.test(segment) && segment !== "." && segment !== "..";
}

function toSlug(owner: string, name: string): RepoSlug | null {
  if (!isValidSegment(owner) || !isValidSegment(name)) return null;
  return { owner, name };
}

/** Accepts "owner/repo" or a github.com URL; returns null for any other input. */
export function parseRepoReference(input: string): RepoSlug | null {
  const text = input.trim();
  if (text === "") return null;

  const urlMatch = URL_FORM.exec(text);
  if (urlMatch) return toSlug(urlMatch[1], urlMatch[2]);

  const plainMatch = PLAIN_FORM.exec(text);
  if (plainMatch) return toSlug(plainMatch[1], plainMatch[2]);

  return null;
}

/** Formats a RepoSlug as "owner/name". */
export function formatRepoSlug(slug: RepoSlug): string {
  return `${slug.owner}/${slug.name}`;
}

/**
 * Builds an App URL with `?repo=owner/name` appended. Each segment is
 * percent-encoded; the separating slash stays literal, and parsing the
 * resulting `repo` value yields the same slug.
 */
export function buildAppUrl(appBaseUrl: string, slug: RepoSlug): string {
  const hashIndex = appBaseUrl.indexOf("#");
  const beforeHash = hashIndex === -1 ? appBaseUrl : appBaseUrl.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : appBaseUrl.slice(hashIndex);
  const separator = beforeHash.includes("?") ? "&" : "?";
  const value = `${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.name)}`;
  return `${beforeHash}${separator}repo=${value}${hash}`;
}
