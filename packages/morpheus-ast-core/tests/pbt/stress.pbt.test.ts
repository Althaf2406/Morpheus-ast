/**
 * tests/pbt/stress.pbt.test.ts
 *
 * Generative stress tests. Unlike the fixed-offset suites, inputs here are
 * arbitrary: Unicode sources (including surrogate pairs), arbitrary splice
 * batches (adjacent, zero-width, shared start index, growing and shrinking),
 * and graphs with dangerous IDs, self-loops, duplicate and dangling edges.
 *
 * Iteration count: FC_RUNS env var (default 300). For a heavier run:
 *   FC_RUNS=5000 pnpm --filter morpheus-ast-core run test:pbt
 */

import * as fc from "fast-check";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { SurgicalMutator, SpliceConflictError } from "../../src/mutator/index.js";
import { FaultInjector, computeBlastRadius } from "../../src/blast-radius/fault-injector.js";
import type {
  CallEdge,
  FaultType,
  FunctionNode,
  SpliceRange,
  TopologyGraph,
} from "../../src/contracts.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");

// ─────────────────────────────────────────────────────────────────────────────
// Splice generators
// ─────────────────────────────────────────────────────────────────────────────

interface Case {
  readonly source: string;
  readonly splices: readonly SpliceRange[];
}

/** UTF-16 indexes that do not fall inside a surrogate pair (always includes 0 and length). */
const codePointBoundaries = (source: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= source.length; i++) {
    const inside =
      i > 0 &&
      i < source.length &&
      source.charCodeAt(i - 1) >= 0xd800 &&
      source.charCodeAt(i - 1) <= 0xdbff &&
      source.charCodeAt(i) >= 0xdc00 &&
      source.charCodeAt(i) <= 0xdfff;
    if (!inside) out.push(i);
  }
  return out;
};

/**
 * Cut points are sorted but NOT strictly increasing, so batches can contain
 * adjacent ranges, zero-width inserts, and several splices sharing a start index.
 */
const caseArb = (): fc.Arbitrary<Case> =>
  fc.fullUnicodeString({ maxLength: 80 }).chain((source) =>
    fc
      .tuple(
        fc.array(fc.constantFrom(...codePointBoundaries(source)), { minLength: 0, maxLength: 12 }),
        fc.array(fc.fullUnicodeString({ maxLength: 8 }), { minLength: 6, maxLength: 6 })
      )
      .map(([rawPoints, replacements]) => {
        const points = [...rawPoints].sort((a, b) => a - b);
        const splices: SpliceRange[] = [];
        for (let i = 0; i + 1 < points.length; i += 2) {
          splices.push({
            filePath: "stress.ts",
            startIndex: points[i]!,
            endIndex: points[i + 1]!,
            replacement: replacements[(i / 2) % replacements.length]!,
            description: `splice-${i / 2}`,
          });
        }
        return { source, splices };
      })
  );

const hasSharedStart = (splices: readonly SpliceRange[]): boolean => {
  const starts = new Set<number>();
  for (const s of splices) {
    if (starts.has(s.startIndex)) return true;
    starts.add(s.startIndex);
  }
  return false;
};

/** Independent oracle: rebuild the string left to right. */
const oracle = (source: string, splices: readonly SpliceRange[]): string => {
  const ordered = [...splices].sort((a, b) => a.startIndex - b.startIndex);
  let out = "";
  let cursor = 0;
  for (const s of ordered) {
    out += source.slice(cursor, s.startIndex) + s.replacement;
    cursor = s.endIndex;
  }
  return out + source.slice(cursor);
};

// ─────────────────────────────────────────────────────────────────────────────
// Mutator stress
// ─────────────────────────────────────────────────────────────────────────────

describe("mutator stress", () => {
  const mutator = new SurgicalMutator();

  it("S1: unambiguous batches match the left-to-right oracle and round-trip exactly", () => {
    fc.assert(
      fc.property(caseArb(), ({ source, splices }) => {
        fc.pre(splices.length > 0 && !hasSharedStart(splices));
        const { mutated, rollbackRecord } = mutator.applyToString(source, splices);
        expect(mutated).toBe(oracle(source, splices));
        expect(mutator.rollbackString(mutated, rollbackRecord)).toBe(source);
      }),
      { numRuns: RUNS }
    );
  });

  it("S2: batches with a shared start index either throw SpliceConflictError or round-trip", () => {
    fc.assert(
      fc.property(caseArb(), ({ source, splices }) => {
        fc.pre(splices.length > 0 && hasSharedStart(splices));
        let result: ReturnType<SurgicalMutator["applyToString"]> | null = null;
        try {
          result = mutator.applyToString(source, splices);
        } catch (err: unknown) {
          expect(err).toBeInstanceOf(SpliceConflictError);
          return;
        }
        expect(mutator.rollbackString(result.mutated, result.rollbackRecord)).toBe(source);
      }),
      { numRuns: RUNS }
    );
  });

  it("S3: apply is independent of the order splices are supplied in", () => {
    fc.assert(
      fc.property(caseArb(), ({ source, splices }) => {
        fc.pre(splices.length > 1 && !hasSharedStart(splices));
        const a = mutator.applyToString(source, splices).mutated;
        const b = mutator.applyToString(source, [...splices].reverse()).mutated;
        expect(a).toBe(b);
      }),
      { numRuns: RUNS }
    );
  });

  it("S4: file-backed apply + rollback restores the file byte-for-byte", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-stress-"));
    try {
      await fc.assert(
        fc.asyncProperty(caseArb(), async ({ source, splices }) => {
          fc.pre(splices.length > 0 && !hasSharedStart(splices));
          const filePath = join(dir, "target.ts");
          await writeFile(filePath, source, "utf-8");
          const fileSplices = splices.map((s) => ({ ...s, filePath }));
          const result = await mutator.apply({ splices: fileSplices });
          expect(await readFile(filePath, "utf-8")).toBe(oracle(source, fileSplices));
          await mutator.rollback(result.rollbackRecord);
          expect(await readFile(filePath, "utf-8")).toBe(source);
        }),
        { numRuns: Math.min(RUNS, 100) }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("mutator surrogate-pair guard", () => {
  const mutator = new SurgicalMutator();

  it("S7: a splice boundary inside a surrogate pair is rejected and the file is left unchanged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-surrogate-"));
    try {
      await fc.assert(
        fc.asyncProperty(
          fc.fullUnicodeString({ maxLength: 20 }),
          fc.fullUnicodeString({ maxLength: 4 }),
          async (prefix, suffix) => {
            const source = `${prefix}\u{1F600}${suffix}`; // always contains one astral character
            const inside = prefix.length + 1; // between the two halves of U+1F600
            const filePath = join(dir, "emoji.ts");
            await writeFile(filePath, source, "utf-8");

            for (const [start, end] of [[inside, inside], [inside, inside + 1], [prefix.length, inside]] as const) {
              await expect(
                mutator.apply({
                  splices: [{ filePath, startIndex: start, endIndex: end, replacement: "x", description: "split pair" }],
                })
              ).rejects.toThrow("surrogate pair");
              expect(await readFile(filePath, "utf-8")).toBe(source);
            }
          }
        ),
        { numRuns: Math.min(RUNS, 100) }
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("S8: replacing a whole astral character at its boundaries round-trips through the file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-astral-"));
    try {
      const filePath = join(dir, "astral.ts");
      const source = "a\u{1F600}b";
      await writeFile(filePath, source, "utf-8");
      const result = await mutator.apply({
        splices: [{ filePath, startIndex: 1, endIndex: 3, replacement: "XYZ", description: "swap emoji" }],
      });
      expect(await readFile(filePath, "utf-8")).toBe("aXYZb");
      await mutator.rollback(result.rollbackRecord);
      expect(await readFile(filePath, "utf-8")).toBe(source);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Blast-radius stress
// ─────────────────────────────────────────────────────────────────────────────

const DANGEROUS_IDS = [
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "__defineGetter__",
];

const makeFn = (id: string, flags: { uncaught: boolean; params: number }): FunctionNode => ({
  id,
  name: id,
  filePath: "stress.ts",
  range: {
    filePath: "stress.ts",
    startLine: 1,
    startColumn: 0,
    endLine: 1,
    endColumn: 0,
    startIndex: 0,
    endIndex: 0,
  },
  cyclomaticComplexity: 1,
  hasCircularDep: false,
  unusedVariables: [],
  hasUncaughtException: flags.uncaught,
  parameterCount: flags.params,
});

interface GraphCase {
  readonly graph: TopologyGraph;
  readonly ids: readonly string[];
}

const graphCaseArb = (): fc.Arbitrary<GraphCase> =>
  fc
    .uniqueArray(
      fc.oneof(fc.constantFrom(...DANGEROUS_IDS), fc.integer({ min: 0, max: 99 }).map((n) => `n${n}`)),
      { minLength: 1, maxLength: 14 }
    )
    .chain((ids) => {
      const endpoint = fc.oneof(
        { weight: 12, arbitrary: fc.constantFrom(...ids) },
        { weight: 1, arbitrary: fc.constant("missing-node") } // dangling reference
      );
      return fc
        .tuple(
          fc.array(fc.tuple(fc.boolean(), fc.nat({ max: 3 })), { minLength: ids.length, maxLength: ids.length }),
          fc.array(fc.tuple(endpoint, endpoint), { maxLength: ids.length * 3 })
        )
        .map(([flags, pairs]) => {
          const functions = ids.map((id, i) =>
            makeFn(id, { uncaught: flags[i]![0], params: flags[i]![1] })
          );
          const edges: CallEdge[] = pairs.map(([callerId, calleeId], i) => ({
            id: `e${i}`,
            callerId,
            calleeId,
            callSite: functions[0]!.range,
            isCyclic: false,
          }));
          const graph: TopologyGraph = {
            modules: [],
            functions,
            edges,
            totalComplexity: functions.length,
            circularDepCount: 0,
            durationMs: 0,
          };
          return { graph, ids };
        });
    });

const faultArb = (): fc.Arbitrary<FaultType> =>
  fc.constantFrom<FaultType>("LATENCY", "NETWORK_FAILURE", "EXTREME_PAYLOAD", "UNCAUGHT_EXCEPTION");

describe("blast-radius stress", () => {
  const injector = new FaultInjector();

  it("S5: arbitrary graphs (self-loops, duplicate and dangling edges, dangerous IDs) hold all invariants", () => {
    const protoKeysBefore = Object.getOwnPropertyNames(Object.prototype).sort().join(",");

    fc.assert(
      fc.property(graphCaseArb(), faultArb(), fc.nat(), ({ graph, ids }, faultType, pick) => {
        const target = ids[pick % ids.length]!;
        const result = injector.inject({ targetFunctionId: target, faultType }, graph);
        const known = new Set(ids);

        expect(result.blastRadiusScore).toBeGreaterThanOrEqual(0);
        expect(result.blastRadiusScore).toBeLessThanOrEqual(1);
        expect(result.centralityScore).toBeGreaterThanOrEqual(0);
        expect(result.centralityScore).toBeLessThanOrEqual(1);

        expect(result.affectedNodes[0]).toBe(target);
        expect(new Set(result.affectedNodes).size).toBe(result.affectedNodes.length);
        for (const id of result.affectedNodes) expect(known.has(id)).toBe(true);

        let lastDepth = 0;
        for (const step of result.cascadePath) {
          expect(step.depth).toBeGreaterThanOrEqual(lastDepth);
          lastDepth = step.depth;
        }
        for (const taint of result.taintPaths) expect(taint.sourceId).toBe(target);
      }),
      { numRuns: RUNS }
    );

    // Nothing the traversals did may have touched Object.prototype.
    expect(Object.getOwnPropertyNames(Object.prototype).sort().join(",")).toBe(protoKeysBefore);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("S6: computeBlastRadius returns a valid rank, scores in [0,1] and reachable nodes only", () => {
    fc.assert(
      fc.property(graphCaseArb(), fc.nat(), ({ graph, ids }, pick) => {
        const target = ids[pick % ids.length]!;
        const r = computeBlastRadius(target, graph);
        expect(r.centralityRank).toBeGreaterThanOrEqual(1);
        expect(r.centralityRank).toBeLessThanOrEqual(ids.length);
        expect(r.centralityScore).toBeGreaterThanOrEqual(0);
        expect(r.centralityScore).toBeLessThanOrEqual(1);
        expect(r.reachabilityScore).toBeGreaterThanOrEqual(0);
        expect(r.reachabilityScore).toBeLessThanOrEqual(1);
        expect(r.reachableNodes).not.toContain(target);
      }),
      { numRuns: RUNS }
    );
  });
});
