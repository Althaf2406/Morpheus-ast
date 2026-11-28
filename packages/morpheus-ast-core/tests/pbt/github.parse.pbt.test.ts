/**
 * tests/pbt/github.parse.pbt.test.ts
 *
 * Feature: bring-your-own-code, Property 8: Repository reference parsing round-trips
 *
 * **Validates: Requirements 2.1**
 */
import * as fc from "fast-check";
import { parseRepositoryRef } from "../../src/loader/github.js";

const RUNS = 100;
const IDENT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.".split("");

/** A GitHub identifier segment that is not "." / ".." and does not end in ".git". */
const segment = fc
  .array(fc.constantFrom(...IDENT_CHARS), { minLength: 1, maxLength: 20 })
  .map((chars) => chars.join(""))
  .filter((s) => s !== "." && s !== ".." && !s.endsWith(".git"));

const branch = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_.".split("")), {
    minLength: 1,
    maxLength: 12,
  })
  .map((chars) => chars.join(""));

describe("Feature: bring-your-own-code, Property 8: Repository reference parsing round-trips", () => {
  it("owner/name parses to the same owner and name", () => {
    fc.assert(
      fc.property(segment, segment, (owner, name) => {
        expect(parseRepositoryRef(`${owner}/${name}`)).toEqual({ owner, name });
      }),
      { numRuns: RUNS }
    );
  });

  it("github.com URLs, with optional .git, trailing slash, or /tree/branch, parse to the same owner and name", () => {
    const suffix = fc.constantFrom("", ".git", "/", ".git/");
    fc.assert(
      fc.property(segment, segment, suffix, fc.option(branch, { nil: undefined }), (owner, name, tail, br) => {
        const base = `https://github.com/${owner}/${name}`;
        const url = br === undefined ? `${base}${tail}` : `${base}/tree/${br}`;
        expect(parseRepositoryRef(url)).toEqual({ owner, name });
      }),
      { numRuns: RUNS }
    );
  });
});
