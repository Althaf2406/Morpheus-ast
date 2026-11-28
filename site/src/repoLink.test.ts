import { describe, expect, it } from "vitest";
import { buildAppUrl, formatRepoSlug, parseRepoReference } from "./repoLink";

const NECRO_URL = "https://necro-compiler.vercel.app";
const INFRA_URL = "https://infrashield-3d.vercel.app";

describe("parseRepoReference", () => {
  it("parses the owner/repo form", () => {
    expect(parseRepoReference("expressjs/cors")).toEqual({ owner: "expressjs", name: "cors" });
  });

  it("accepts dots, dashes and underscores in segments", () => {
    expect(parseRepoReference("sindresorhus/p-limit")).toEqual({ owner: "sindresorhus", name: "p-limit" });
    expect(parseRepoReference("a_b/c.d")).toEqual({ owner: "a_b", name: "c.d" });
  });

  it("parses the github.com URL form", () => {
    const expected = { owner: "expressjs", name: "cors" };
    expect(parseRepoReference("https://github.com/expressjs/cors")).toEqual(expected);
    expect(parseRepoReference("http://github.com/expressjs/cors")).toEqual(expected);
    expect(parseRepoReference("github.com/expressjs/cors")).toEqual(expected);
    expect(parseRepoReference("https://www.github.com/expressjs/cors")).toEqual(expected);
  });

  it("accepts a trailing slash", () => {
    expect(parseRepoReference("expressjs/cors/")).toEqual({ owner: "expressjs", name: "cors" });
    expect(parseRepoReference("https://github.com/expressjs/cors/")).toEqual({
      owner: "expressjs",
      name: "cors",
    });
  });

  it("strips a .git suffix from URLs, with or without a trailing slash", () => {
    const expected = { owner: "expressjs", name: "cors" };
    expect(parseRepoReference("https://github.com/expressjs/cors.git")).toEqual(expected);
    expect(parseRepoReference("https://github.com/expressjs/cors.git/")).toEqual(expected);
  });

  it("trims surrounding whitespace", () => {
    expect(parseRepoReference("  expressjs/cors \n")).toEqual({ owner: "expressjs", name: "cors" });
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(parseRepoReference("")).toBeNull();
    expect(parseRepoReference("   ")).toBeNull();
    expect(parseRepoReference("\t\n")).toBeNull();
  });

  it.each([
    "expressjs",
    "expressjs/",
    "/cors",
    "a/b/c",
    "owner repo",
    "owner/re po",
    "owner/re$po",
    "../cors",
    "owner/..",
    "https://github.com/owner",
    "https://github.com/owner/repo/tree/main",
    "https://gitlab.com/owner/repo",
    "https://example.com/owner/repo",
    "not a url at all",
    "https://",
  ])("returns null for malformed input %j", (input) => {
    expect(parseRepoReference(input)).toBeNull();
  });
});

describe("formatRepoSlug", () => {
  it("formats as owner/name", () => {
    expect(formatRepoSlug({ owner: "expressjs", name: "cors" })).toBe("expressjs/cors");
  });
});

describe("buildAppUrl", () => {
  const slug = { owner: "expressjs", name: "cors" };

  it("appends ?repo=owner/name to the Necro app URL", () => {
    expect(buildAppUrl(NECRO_URL, slug)).toBe("https://necro-compiler.vercel.app?repo=expressjs/cors");
  });

  it("appends ?repo=owner/name to the Infra app URL", () => {
    expect(buildAppUrl(INFRA_URL, slug)).toBe("https://infrashield-3d.vercel.app?repo=expressjs/cors");
  });

  it("produces a URL whose repo parameter parses back to the same slug", () => {
    for (const base of [NECRO_URL, INFRA_URL]) {
      const param = new URL(buildAppUrl(base, slug)).searchParams.get("repo");
      expect(param).not.toBeNull();
      expect(parseRepoReference(param ?? "")).toEqual(slug);
    }
  });

  it("uses & when the base URL already has a query string", () => {
    expect(buildAppUrl(`${NECRO_URL}/?x=1`, slug)).toBe(
      "https://necro-compiler.vercel.app/?x=1&repo=expressjs/cors",
    );
  });

  it("keeps a hash fragment after the query", () => {
    expect(buildAppUrl(`${INFRA_URL}/#top`, slug)).toBe(
      "https://infrashield-3d.vercel.app/?repo=expressjs/cors#top",
    );
  });
});
