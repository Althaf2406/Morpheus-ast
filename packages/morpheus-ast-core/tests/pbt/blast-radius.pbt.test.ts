/**
 * tests/pbt/blast-radius.pbt.test.ts
 *
 * Property-Based Tests for the blast-radius engine.
 *
 * Properties verified (100+ iterations each):
 *
 *   P1 — BlastRadius Bounds:
 *     blastRadiusScore ∈ [0, 1] for any valid topology graph
 *
 *   P2 — CentralityScore Bounds:
 *     centralityScore ∈ [0, 1]
 *
 *   P3 — AffectedNodes Subset:
 *     affectedNodes ⊆ graph.functions (no phantom node IDs)
 *
 *   P4 — TargetAlwaysAffected:
 *     targetFunctionId ∈ affectedNodes
 *
 *   P5 — PrototypePollutionSafe:
 *     Injecting a graph whose function IDs include "__proto__", "constructor",
 *     or "prototype" does NOT throw or corrupt the adjacency Map.
 *
 *   P6 — EmptyGraphSafe:
 *     A single-node graph with no edges returns blastRadiusScore = 1.0
 *     and cascadePath = [].
 *
 *   P7 — TaintPathSourceEqualsTarget:
 *     Every taint path's sourceId === targetFunctionId.
 */

import * as fc from "fast-check";
import { ChaosFaultInjector, FaultInjectionError } from "../../src/blast-radius/fault-injector.js";
import type {
  TopologyGraph,
  FunctionNode,
  CallEdge,
  ModuleNode,
  FaultType,
  SourceRange,
} from "../../src/contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Arbitraries
// ─────────────────────────────────────────────────────────────────────────────

const sourceRangeArb = (): fc.Arbitrary<SourceRange> =>
  fc.record({
    filePath: fc.constant("test.ts"),
    startLine: fc.nat({ max: 999 }),
    startColumn: fc.nat({ max: 120 }),
    endLine: fc.nat({ max: 999 }),
    endColumn: fc.nat({ max: 120 }),
    startIndex: fc.nat({ max: 50000 }),
    endIndex: fc.nat({ max: 50000 }),
  });

/**
 * Generates a valid function ID.
 * Deliberately includes "__proto__", "constructor", "prototype" in the pool
 * to exercise prototype-pollution safety (P5).
 * Prefixed with _ because protoPollutionGraphArb uses inline constants instead.
 */
const _fnIdArb = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 20 }).map((s) => `fn:${s}`),
    fc.constant("fn:__proto__"),
    fc.constant("fn:constructor"),
    fc.constant("fn:prototype"),
    fc.constant("fn:hasOwnProperty"),
    fc.constant("fn:toString")
  );

const functionNodeArb = (id: string): fc.Arbitrary<FunctionNode> =>
  fc.record({
    id: fc.constant(id),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    filePath: fc.constant("test.ts"),
    range: sourceRangeArb(),
    cyclomaticComplexity: fc.integer({ min: 1, max: 50 }),
    hasCircularDep: fc.boolean(),
    unusedVariables: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
    hasUncaughtException: fc.boolean(),
    parameterCount: fc.nat({ max: 10 }),
  });

/** Generates a TopologyGraph with n functions and random edges. */
const topologyGraphArb = (minFns = 1, maxFns = 20): fc.Arbitrary<TopologyGraph> =>
  fc.integer({ min: minFns, max: maxFns })
    .chain((n) => {
      const ids = Array.from({ length: n }, (_, i) => `fn:node-${i}`);
      return fc.tuple(
        fc.tuple(...ids.map((id) => functionNodeArb(id))),
        fc.array(
          fc.record({
            callerId: fc.constantFrom(...ids),
            calleeId: fc.constantFrom(...ids),
          }),
          { maxLength: n * 2 }
        )
      ).map(([fns, rawEdges]) => {
        const functions = fns as FunctionNode[];
        const edges: CallEdge[] = rawEdges
          .filter((e) => e.callerId !== e.calleeId) // no self-loops in basic graph
          .map((e, i) => ({
            id: `edge-${i}`,
            callerId: e.callerId,
            calleeId: e.calleeId,
            callSite: {
              filePath: "test.ts",
              startLine: 1, startColumn: 0,
              endLine: 1, endColumn: 0,
              startIndex: 0, endIndex: 0,
            },
            isCyclic: false,
          }));

        const modules: ModuleNode[] = [{
          id: "module:test.ts",
          filePath: "test.ts",
          functionIds: functions.map((f) => f.id),
          isCircularDepMember: false,
        }];

        return {
          modules,
          functions,
          edges,
          totalComplexity: functions.reduce((s, f) => s + f.cyclomaticComplexity, 0),
          circularDepCount: 0,
          durationMs: 0,
        } satisfies TopologyGraph;
      });
    });

/** Graph whose function IDs include dangerous prototype-chain key names. */
const protoPollutionGraphArb = (): fc.Arbitrary<TopologyGraph> =>
  fc.integer({ min: 2, max: 8 }).chain((n) => {
    const dangerousIds = [
      "fn:__proto__", "fn:constructor", "fn:prototype",
      "fn:hasOwnProperty", "fn:toString", "fn:valueOf",
    ];
    const safeIds = Array.from({ length: n }, (_, i) => `fn:safe-${i}`);
    const allIds = [...dangerousIds.slice(0, Math.min(3, n)), ...safeIds];

    return fc.tuple(
      fc.tuple(...allIds.map((id) => functionNodeArb(id))),
    ).map(([fns]) => {
      const functions = fns as FunctionNode[];
      const edges: CallEdge[] = functions.slice(0, -1).map((f, i) => ({
        id: `edge-${i}`,
        callerId: f.id,
        calleeId: functions[i + 1]!.id,
        callSite: {
          filePath: "test.ts", startLine: 1, startColumn: 0,
          endLine: 1, endColumn: 0, startIndex: 0, endIndex: 0,
        },
        isCyclic: false,
      }));
      return {
        modules: [{ id: "mod:test", filePath: "test.ts",
          functionIds: functions.map((f) => f.id), isCircularDepMember: false }],
        functions, edges,
        totalComplexity: 10, circularDepCount: 0, durationMs: 0,
      } satisfies TopologyGraph;
    });
  });

const faultTypeArb = (): fc.Arbitrary<FaultType> =>
  fc.constantFrom(
    "LATENCY" as const,
    "NETWORK_FAILURE" as const,
    "EXTREME_PAYLOAD" as const,
    "UNCAUGHT_EXCEPTION" as const
  );

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("blast-radius PBT", () => {
  const injector = new ChaosFaultInjector();

  // ── P1 & P2: Bounds ────────────────────────────────────────────────────────
  it("P1+P2: blastRadiusScore and centralityScore ∈ [0,1] for any graph", () => {
    fc.assert(
      fc.property(topologyGraphArb(1, 15), faultTypeArb(), (graph, faultType) => {
        const target = graph.functions[0]!;
        const result = injector.inject(
          { targetFunctionId: target.id, faultType },
          graph
        );
        expect(result.blastRadiusScore).toBeGreaterThanOrEqual(0);
        expect(result.blastRadiusScore).toBeLessThanOrEqual(1);
        expect(result.centralityScore).toBeGreaterThanOrEqual(0);
        expect(result.centralityScore).toBeLessThanOrEqual(1);
      }),
      { numRuns: 150, seed: 42 }
    );
  });

  // ── P3: AffectedNodes ⊆ graph.functions ────────────────────────────────────
  it("P3: affectedNodes contains only IDs present in the graph", () => {
    fc.assert(
      fc.property(topologyGraphArb(1, 20), faultTypeArb(), (graph, faultType) => {
        const target = graph.functions[0]!;
        const result = injector.inject(
          { targetFunctionId: target.id, faultType },
          graph
        );
        const validIds = new Set(graph.functions.map((f) => f.id));
        for (const id of result.affectedNodes) {
          expect(validIds.has(id)).toBe(true);
        }
      }),
      { numRuns: 150, seed: 43 }
    );
  });

  // ── P4: Target always in affectedNodes ─────────────────────────────────────
  it("P4: targetFunctionId is always in affectedNodes", () => {
    fc.assert(
      fc.property(topologyGraphArb(1, 20), faultTypeArb(), (graph, faultType) => {
        const target = graph.functions[0]!;
        const result = injector.inject(
          { targetFunctionId: target.id, faultType },
          graph
        );
        expect(result.affectedNodes).toContain(target.id);
      }),
      { numRuns: 150, seed: 44 }
    );
  });

  // ── P5: Prototype-pollution safe ────────────────────────────────────────────
  it("P5: function IDs of __proto__/constructor/prototype do not corrupt the Map", () => {
    fc.assert(
      fc.property(protoPollutionGraphArb(), faultTypeArb(), (graph, faultType) => {
        const target = graph.functions[0]!;
        // Must not throw and must return valid bounds
        expect(() => {
          const result = injector.inject(
            { targetFunctionId: target.id, faultType },
            graph
          );
          expect(result.blastRadiusScore).toBeGreaterThanOrEqual(0);
          expect(result.blastRadiusScore).toBeLessThanOrEqual(1);
        }).not.toThrow();
      }),
      { numRuns: 100, seed: 45 }
    );
  });

  // ── P6: Single-node graph ───────────────────────────────────────────────────
  it("P6: single-node graph has blastRadiusScore = 1.0 and empty cascadePath", () => {
    fc.assert(
      fc.property(faultTypeArb(), (faultType) => {
        const singleGraph: TopologyGraph = {
          modules: [],
          functions: [{
            id: "fn:only",
            name: "onlyFunction",
            filePath: "test.ts",
            range: { filePath: "test.ts", startLine: 1, startColumn: 0,
              endLine: 10, endColumn: 0, startIndex: 0, endIndex: 100 },
            cyclomaticComplexity: 3,
            hasCircularDep: false,
            unusedVariables: [],
            hasUncaughtException: false,
            parameterCount: 1,
          }],
          edges: [],
          totalComplexity: 3,
          circularDepCount: 0,
          durationMs: 0,
        };
        const result = injector.inject(
          { targetFunctionId: "fn:only", faultType },
          singleGraph
        );
        expect(result.blastRadiusScore).toBe(1.0);
        expect(result.cascadePath).toHaveLength(0);
      }),
      { numRuns: 100, seed: 46 }
    );
  });

  // ── P7: Taint path sourceId = targetFunctionId ─────────────────────────────
  it("P7: every taint path's sourceId equals the targetFunctionId", () => {
    fc.assert(
      fc.property(
        topologyGraphArb(2, 15),
        fc.constantFrom("EXTREME_PAYLOAD" as const, "UNCAUGHT_EXCEPTION" as const),
        (graph, faultType) => {
          const target = graph.functions[0]!;
          const result = injector.inject(
            { targetFunctionId: target.id, faultType },
            graph
          );
          for (const taintPath of result.taintPaths) {
            expect(taintPath.sourceId).toBe(target.id);
          }
        }
      ),
      { numRuns: 100, seed: 47 }
    );
  });

  // ── P8: Unknown function ID throws FaultInjectionError ─────────────────────
  it("P8: unknown targetFunctionId throws FaultInjectionError", () => {
    fc.assert(
      fc.property(topologyGraphArb(1, 10), faultTypeArb(), (graph, faultType) => {
        expect(() =>
          injector.inject(
            { targetFunctionId: "fn:definitely-not-in-graph-xyzzy", faultType },
            graph
          )
        ).toThrow(FaultInjectionError);
      }),
      { numRuns: 100, seed: 48 }
    );
  });
});
