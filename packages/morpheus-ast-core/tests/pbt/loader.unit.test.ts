/**
 * tests/pbt/loader.unit.test.ts
 *
 * Example tests for loadCode (bring-your-own-code, task 3.1).
 * Covers Requirements 1.2, 1.3, 1.4, 1.4a, 1.4b, 1.6, 1.7, 1.8.
 */
import { loadCode } from "../../src/loader/index.js";
import type { CandidateFile, LoadResult } from "../../src/contracts.js";

const MAX_FILE = 102_400;
const MAX_TOTAL = 409_600;

function file(path: string, content = "const a = 1;"): CandidateFile {
  return { path, content };
}

function reasonOf(result: LoadResult, path: string): string | undefined {
  return result.skipped.find((s) => s.path === path)?.reason;
}

function loadedPaths(result: LoadResult): string[] {
  return result.files.map((f) => f.filePath);
}

describe("loader: ignored folders (Req 1.3)", () => {
  it.each(["node_modules", "dist", "build", ".git"])("skips files under %s", (folder) => {
    const path = `${folder}/pkg/a.ts`;
    const result = loadCode([file(path)]);
    expect(result.files).toEqual([]);
    expect(reasonOf(result, path)).toBe("ignored folder");
  });
});

describe("loader: extensions (Req 1.2, 1.3)", () => {
  it.each([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])("loads %s files", (ext) => {
    const result = loadCode([file(`src/a${ext}`)]);
    expect(loadedPaths(result)).toEqual([`src/a${ext}`]);
    expect(result.skipped).toEqual([]);
  });

  it.each(["src/a.py", "src/a.json", "README.md", "src/a.d.ts"])(
    "skips %s as unsupported type",
    (path) => {
      const result = loadCode([file(path)]);
      expect(result.files).toEqual([]);
      expect(reasonOf(result, path)).toBe("unsupported type");
    }
  );
});

describe("loader: empty files (Req 1.4)", () => {
  it.each(["", "   \n\t "])("skips content %j as empty file", (content) => {
    const result = loadCode([file("src/a.ts", content)]);
    expect(reasonOf(result, "src/a.ts")).toBe("empty file");
  });
});

describe("loader: test files (Req 1.4a)", () => {
  it.each([
    "src/foo.test.ts",
    "src/bar.spec.tsx",
    "src/__tests__/helper.ts",
    "src/__tests__/deep/x.js",
    "test/index.js",
    "src/tests/util.ts",
    "spec/a.ts",
    "specs/a.ts",
    "src/__mocks__/fs.js",
    "e2e/login.ts",
    "test/fixtures/data.js",
    "fixtures/a.js",
    "lib/fixtures/deep/a.ts",
    "test.js",
    "src/tests.ts",
    "src/spec.js",
    "src/a.test-d.ts",
    "src/a.e2e.ts",
    "bench/a.bench.js",
    "src/a.b.spec.ts",
    "Test/Upper.ts",
    "test-d/index.ts",
    "test-d/deep/a.ts",
    "src/type-tests/a.ts",
    "src/types-test/a.ts",
    "src/__fixtures__/a.js",
    "benchmark/a.js",
    "benchmarks/deep/a.ts",
  ])("skips %s as test file", (path) => {
    const result = loadCode([file(path)]);
    expect(result.files).toEqual([]);
    expect(reasonOf(result, path)).toBe("test file");
  });
});

describe("loader: names that only look like tests", () => {
  it.each([
    "src/testing.ts",
    "src/tester.js",
    "src/latest.ts",
    "src/contest/a.ts",
    "src/specification.ts",
    "src/e2e-helpers.ts",
    "src/fixture.ts",
    "src/benchmark.ts",
    "src/test-utils.ts",
  ])("keeps %s", (path) => {
    const result = loadCode([file(path)]);
    expect(loadedPaths(result)).toEqual([path]);
  });
  it("reports unsupported type before test file, and ignored folder before test file", () => {
    const result = loadCode([file("test/a.md"), file("node_modules/x/test/a.js")]);
    expect(reasonOf(result, "test/a.md")).toBe("unsupported type");
    expect(reasonOf(result, "node_modules/x/test/a.js")).toBe("ignored folder");
  });
});
describe("loader: per-file size boundary (Req 1.4b)", () => {
  it("loads a file of exactly 102,400 bytes", () => {
    const result = loadCode([file("a.ts", "a".repeat(MAX_FILE))]);
    expect(loadedPaths(result)).toEqual(["a.ts"]);
    expect(result.summary.totalBytes).toBe(MAX_FILE);
  });

  it("skips a file of 102,401 bytes as file too large", () => {
    const result = loadCode([file("a.ts", "a".repeat(MAX_FILE + 1))]);
    expect(result.files).toEqual([]);
    expect(reasonOf(result, "a.ts")).toBe("file too large");
  });

  it("counts UTF-8 bytes, not characters", () => {
    const result = loadCode([file("a.ts", "é".repeat(MAX_FILE / 2 + 1))]);
    expect(reasonOf(result, "a.ts")).toBe("file too large");
  });
});

describe("loader: total size boundary (Req 1.6, 1.7, 1.8)", () => {
  const big = "a".repeat(MAX_FILE);
  const four = ["a", "b", "c", "d"].map((n) => file(`${n}.ts`, big));

  it("loads files totalling exactly 409,600 bytes", () => {
    const result = loadCode(four);
    expect(result.files).toHaveLength(4);
    expect(result.summary.totalBytes).toBe(MAX_TOTAL);
    expect(result.skipped).toEqual([]);
  });

  it("skips the next file once the total would exceed 409,600 bytes", () => {
    const result = loadCode([...four, file("e.ts", "x")]);
    expect(result.files).toHaveLength(4);
    expect(reasonOf(result, "e.ts")).toBe("limit exceeded");
  });

  it("skips every later file after the first overflow, even small ones", () => {
    const first = file("a.ts", big);
    const mid = ["b", "c", "d"].map((n) => file(`${n}.ts`, "a".repeat(MAX_FILE - 1)));
    const tail = [file("e.ts", big), file("f.ts", "x")];
    const result = loadCode([first, ...mid, ...tail]);
    expect(loadedPaths(result)).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
    expect(reasonOf(result, "e.ts")).toBe("limit exceeded");
    expect(reasonOf(result, "f.ts")).toBe("limit exceeded");
  });
});

describe("loader: file count boundary (Req 1.6, 1.7, 1.8)", () => {
  const make = (n: number): CandidateFile[] =>
    Array.from({ length: n }, (_, i) => file(`src/f${String(i).padStart(3, "0")}.ts`));

  it("loads exactly 60 files", () => {
    const result = loadCode(make(60));
    expect(result.files).toHaveLength(60);
    expect(result.skipped).toEqual([]);
  });

  it("skips the 61st file as limit exceeded and still succeeds", () => {
    const result = loadCode(make(61));
    expect(result.files).toHaveLength(60);
    expect(result.skipped).toEqual([{ path: "src/f060.ts", reason: "limit exceeded" }]);
    expect(result.summary).toEqual({
      loadedCount: 60,
      totalBytes: 60 * "const a = 1;".length,
      skippedCount: 1,
    });
  });
});
