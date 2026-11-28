/**
 * tests/pbt/github.format.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 9: Unparseable references yield a format error
 *
 * **Validates: Requirements 2.2**
 */
import * as fc from "fast-check";
import { fetchGitHubRepository, parseRepositoryRef } from "../../src/loader/github.js";

const RUNS = 100;

const segment = fc.stringMatching(/^[A-Za-z0-9_.-]{1,12}$/);
const badChar = fc.constantFrom(" ", "!", "@", "#", "?", ":", "\\", "\u00e9", "\t");

/** Strings that are neither `owner/name` nor a https://github.com URL. */
const unparseable: fc.Arbitrary<string> = fc.oneof(
  // No slash at all: cannot be owner/name, cannot be a URL.
  fc.string({ maxLength: 30 }).map((s) => s.replaceAll("/", "")),
  // Too many path segments without a URL scheme.
  fc
    .tuple(segment, segment, segment)
    .map(([a, b, c]) => `${a}/${b}/${c}`),
  // Missing owner or missing name.
  segment.map((s) => `/${s}`),
  segment.map((s) => `${s}/`),
  // Illegal character embedded in the owner or the name.
  fc
    .tuple(segment, badChar, segment, fc.boolean())
    .map(([a, bad, b, inOwner]) => (inOwner ? `${a}${bad}${a}/${b}` : `${a}/${b}${bad}${b}`)),
  // Wrong scheme or host.
  fc
    .tuple(fc.constantFrom("http://github.com", "https://gitlab.com", "ftp://github.com"), segment, segment)
    .map(([base, a, b]) => `${base}/${a}/${b}`)
);

describe("Feature: bring-your-own-code, Property 9: Unparseable references yield a format error", () => {
  it("parseRepositoryRef returns null for unparseable references", () => {
    fc.assert(
      fc.property(unparseable, (value) => {
        expect(parseRepositoryRef(value)).toBeNull();
      }),
      { numRuns: RUNS }
    );
  });

  it("fetchGitHubRepository returns a format error and never calls fetchFn", async () => {
    await fc.assert(
      fc.asyncProperty(unparseable, async (value) => {
        let calls = 0;
        const fetchFn: typeof fetch = () => {
          calls += 1;
          return Promise.reject(new Error("fetchFn must not be called"));
        };
        const result = await fetchGitHubRepository(value, fetchFn);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.kind).toBe("format");
          expect(result.error.message).toContain("owner/name");
        }
        expect(calls).toBe(0);
      }),
      { numRuns: RUNS }
    );
  });
});
