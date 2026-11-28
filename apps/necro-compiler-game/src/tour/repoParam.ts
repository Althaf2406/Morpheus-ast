/** Appends the current page's ?repo= value (if any) to a base URL. */
export function withCurrentRepo(baseUrl: string): string {
  const repo = new URLSearchParams(window.location.search).get("repo");
  if (repo === null || repo === "") return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set("repo", repo);
  return url.toString();
}
