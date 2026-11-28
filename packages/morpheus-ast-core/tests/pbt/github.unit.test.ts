/**
 * tests/pbt/github.unit.test.ts
 *
 * Example tests for fetchGitHubRepository with an injected fake fetch (task 3.14).
 * No real network is used.
 */
import { fetchGitHubRepository } from "../../src/loader/github.js";
import type { FetchGitHubRepository } from "../../src/contracts.js";

type Handler = (url: string) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
function text(body: string, status = 200): Response {
  return new Response(body, { status });
}
function fakeFetch(handler: Handler): { fn: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fn = (input: string | URL): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    return Promise.resolve(handler(url));
  };
  return { fn: fn as typeof fetch, urls };
}
function blob(path: string, size = 10): { path: string; type: string; size: number } {
  return { path, type: "blob", size };
}
function errorOf(result: Awaited<ReturnType<FetchGitHubRepository>>): { kind: string; message: string } {
  if (result.ok) throw new Error("expected failure");
  return result.error;
}

const TREE = { tree: [blob("src/a.ts"), blob("src/b.js")] };

function repoHandler(url: string): Response {
  if (url === "https://api.github.com/repos/o/r") return json({ default_branch: "trunk" });
  if (url.includes("/git/trees/")) return json(TREE);
  return text(`// ${url}\nconst x = 1;\n`);
}

describe("fetchGitHubRepository (mocked fetch)", () => {
  it("resolves the default branch and loads eligible files", async () => {
    const { fn, urls } = fakeFetch(repoHandler);
    const result = await fetchGitHubRepository("o/r", fn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.files.map((f) => f.filePath).sort()).toEqual(["src/a.ts", "src/b.js"]);
    expect(urls).toContain("https://api.github.com/repos/o/r/git/trees/trunk?recursive=1");
    expect(urls).toContain("https://raw.githubusercontent.com/o/r/trunk/src/a.ts");
  });

  it("uses the branch from a /tree/ URL without looking up the default branch", async () => {
    const { fn, urls } = fakeFetch(repoHandler);
    const result = await fetchGitHubRepository("https://github.com/o/r/tree/dev", fn);
    expect(result.ok).toBe(true);
    expect(urls).not.toContain("https://api.github.com/repos/o/r");
    expect(urls).toContain("https://api.github.com/repos/o/r/git/trees/dev?recursive=1");
    expect(urls).toContain("https://raw.githubusercontent.com/o/r/dev/src/b.js");
  });

  it.each([403, 429])("maps HTTP %i to a rate-limit error mentioning paste/upload", async (status) => {
    const { fn } = fakeFetch(() => json({}, status));
    const error = errorOf(await fetchGitHubRepository("o/r", fn));
    expect(error.kind).toBe("rate-limit");
    expect(error.message).toMatch(/paste/i);
    expect(error.message).toMatch(/upload/i);
  });

  it("maps 404 on the repository lookup to not-found", async () => {
    const { fn } = fakeFetch(() => json({}, 404));
    expect(errorOf(await fetchGitHubRepository("o/r", fn)).kind).toBe("not-found");
  });

  it("maps 404 on the tree lookup to not-found", async () => {
    const { fn } = fakeFetch((url) => (url.includes("/git/trees/") ? json({}, 404) : repoHandler(url)));
    expect(errorOf(await fetchGitHubRepository("o/r", fn)).kind).toBe("not-found");
  });

  it("maps a thrown fetch to a network error", async () => {
    const { fn } = fakeFetch(() => {
      throw new TypeError("offline");
    });
    expect(errorOf(await fetchGitHubRepository("o/r", fn)).kind).toBe("network");
  });

  it("rejects a malformed reference with a format error and no requests", async () => {
    const { fn, urls } = fakeFetch(repoHandler);
    expect(errorOf(await fetchGitHubRepository("not a repo!", fn)).kind).toBe("format");
    expect(urls).toEqual([]);
  });

  it("skips a file whose download fails and keeps the others", async () => {
    const { fn } = fakeFetch((url) => (url.endsWith("/src/b.js") ? text("", 500) : repoHandler(url)));
    const result = await fetchGitHubRepository("o/r", fn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.files.map((f) => f.filePath)).toEqual(["src/a.ts"]);
    expect(result.result.skipped).toContainEqual({ path: "src/b.js", reason: "download failed" });
  });

  it("never downloads ineligible tree entries", async () => {
    const tree = {
      tree: [
        blob("src/a.ts"),
        blob("README.md"),
        blob("node_modules/p/i.js"),
        blob("src/a.test.ts"),
        blob("types/x.d.ts"),
        { path: "src", type: "tree" },
      ],
    };
    const { fn, urls } = fakeFetch((url) => (url.includes("/git/trees/") ? json(tree) : repoHandler(url)));
    await fetchGitHubRepository("https://github.com/o/r/tree/main", fn);
    const downloads = urls.filter((u) => u.startsWith("https://raw.githubusercontent.com/"));
    expect(downloads).toEqual(["https://raw.githubusercontent.com/o/r/main/src/a.ts"]);
  });
});
