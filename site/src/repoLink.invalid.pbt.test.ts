import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseRepoReference } from "./repoLink";

/**
 * Feature: landing-hub-and-onboarding, Property 2: Invalid or empty Repo_Reference never navigates
 *
 * **Validates: Requirements 4.7**
 */

const NUM_RUNS = 200;

const VALID_CHAR = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-".split(""),
);
const BAD_CHAR = fc.constantFrom(..."!@#$%^&*()+=,;:'\"<>?|\\~`[]{}".split(""));

const validSegment = fc.stringOf(VALID_CHAR, { minLength: 1, maxLength: 12 });

/** A segment that always contains at least one character outside [A-Za-z0-9._-]. */
const shortValid = fc.stringOf(VALID_CHAR, { maxLength: 6 });
const invalidSegment = fc
  .tuple(shortValid, BAD_CHAR, shortValid)
  .map(([a, bad, b]) => `${a}${bad}${b}`);

const notGithubHost = (s: string): boolean => !/github\.com/i.test(s);

const emptyString = fc.constant("");

const whitespaceOnly = fc.stringOf(
  fc.constantFrom(" ", "\t", "\n", "\r", "\v", "\f", "\u00a0", "\u2003", "\u3000", "\ufeff"),
  { minLength: 1, maxLength: 20 },
);

/** Arbitrary text that contains no slash, so it can be neither owner/repo nor a URL. */
const noSlashGarbage = fc.string({ maxLength: 40 }).filter((s) => !s.includes("/"));

/** owner/name where at least one side holds a disallowed character. */
const badCharacterPair = fc
  .tuple(
    fc.boolean(),
    validSegment,
    invalidSegment,
  )
  .map(([ownerBad, good, bad]) => (ownerBad ? `${bad}/${good}` : `${good}/${bad}`))
  .filter((s) => s.trim() !== "" && notGithubHost(s));

/** Structural defects: missing side, extra segments, doubled slashes, dot segments. */
const malformedShape = fc
  .tuple(validSegment, validSegment, validSegment)
  .chain(([a, b, c]) =>
    fc.constantFrom(
      `${a}/`,
      `/${a}`,
      `/${a}/${b}`,
      `${a}//${b}`,
      `${a}/${b}//`,
      `${a}/${b}/${c}`,
      `${a}/${b}/${c}/`,
      `./${a}`,
      `${a}/.`,
      `../${a}`,
      `${a}/..`,
      `../..`,
      `./.`,
      "/",
      "//",
    ),
  )
  .filter(notGithubHost);

/** github.com URLs that lack a repository, or carry an invalid one. */
const malformedUrl = fc
  .tuple(validSegment, invalidSegment)
  .chain(([good, bad]) =>
    fc.constantFrom(
      "https://github.com",
      "https://github.com/",
      `https://github.com/${good}`,
      `https://github.com/${good}/`,
      `https://github.com/${bad}/${good}`,
      `https://github.com/${good}/${bad}`,
      `https://github.com/${good}/${good}/extra`,
      `ftp://github.com/${good}/${good}`,
      `https://example.com/${good}/${good}`,
    ),
  );

const invalidReference = fc.oneof(
  emptyString,
  whitespaceOnly,
  noSlashGarbage,
  badCharacterPair,
  malformedShape,
  malformedUrl,
);

describe("Property 2: Invalid or empty Repo_Reference never navigates", () => {
  it("returns null for the empty string", () => {
    expect(parseRepoReference("")).toBeNull();
  });

  it("returns null for whitespace-only strings", () => {
    fc.assert(
      fc.property(whitespaceOnly, (input) => {
        expect(parseRepoReference(input)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns null for garbage without an owner/repo shape", () => {
    fc.assert(
      fc.property(noSlashGarbage, (input) => {
        expect(parseRepoReference(input)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns null for owner/repo pairs containing disallowed characters", () => {
    fc.assert(
      fc.property(badCharacterPair, (input) => {
        expect(parseRepoReference(input)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns null for malformed shapes and malformed github.com URLs", () => {
    fc.assert(
      fc.property(fc.oneof(malformedShape, malformedUrl), (input) => {
        expect(parseRepoReference(input)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("returns null for any invalid reference, including surrounding whitespace", () => {
    fc.assert(
      fc.property(whitespaceOnly, invalidReference, whitespaceOnly, (pre, input, post) => {
        expect(parseRepoReference(input)).toBeNull();
        expect(parseRepoReference(`${pre}${input}${post}`)).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
