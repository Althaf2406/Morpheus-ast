import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { buildAppUrl, formatRepoSlug, parseRepoReference } from "./repoLink";

const SEGMENT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-".split("");

const segmentArb = fc
  .array(fc.constantFrom(...SEGMENT_CHARS), { minLength: 1, maxLength: 40 })
  .map((chars) => chars.join(""))
  .filter((s) => s !== "." && s !== "..");

const slugArb = fc.record({ owner: segmentArb, name: segmentArb });

const baseUrlArb = fc.constantFrom(
  "https://example.com/app/",
  "https://example.com/app",
  "http://localhost:5173/",
  "/necro/",
  "https://example.com/app/?mode=city",
);

describe("repoLink round-trip", () => {
  // Feature: landing-hub-and-onboarding, Property 1: Repo reference round-trip through the App URL
  // **Validates: Requirements 4.2, 4.3, 4.5, 4.6, 4.10**
  it("Property 1: buildAppUrl then parsing the repo query value yields the same slug", () => {
    fc.assert(
      fc.property(slugArb, baseUrlArb, (slug, base) => {
        const parsed = parseRepoReference(formatRepoSlug(slug));
        expect(parsed).toEqual(slug);

        const url = buildAppUrl(base, parsed!);
        const expectedValue = `${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.name)}`;
        expect(url).toContain(`repo=${expectedValue}`);

        const query = url.slice(url.indexOf("?") + 1);
        const repoParam = new URLSearchParams(query).get("repo");
        expect(repoParam).toBe(`${slug.owner}/${slug.name}`);

        expect(parseRepoReference(repoParam!)).toEqual(slug);
      }),
      { numRuns: 100 },
    );
  });
});
