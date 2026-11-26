/**
 * Property-based test: a stale AI patch answer never overwrites a newer fault's state.
 *
 * Property 7. **Validates: Requirements 6.6**
 *
 * The engine is replaced by a stub whose `generateBedrockPatch` returns deferred promises,
 * so the test decides the order in which the AI answers (or rejections) arrive.
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import type {
  BedrockPatchSuggestion,
  FaultInjectionRequest,
  FaultInjectionResult,
  MorpheusASTEngine,
  ParsedFile,
  TopologyGraph,
  FunctionNode,
  SecurityScanResult,
  BedrockPatchRequest,
} from "../../../../packages/morpheus-ast-core/src/contracts.js";
import { InfraShieldAdapter } from "../adapter";

// --- Fixtures ---

const FILE_PATH = "sample.ts";
const FN_LENGTH = 10;

interface Deferred {
  readonly promise: Promise<BedrockPatchSuggestion>;
  readonly resolve: (patch: BedrockPatchSuggestion) => void;
  readonly reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve!: (patch: BedrockPatchSuggestion) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BedrockPatchSuggestion>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function functionNode(index: number): FunctionNode {
  return {
    id: `fn-${index}`,
    name: `fn${index}`,
    filePath: FILE_PATH,
    range: {
      filePath: FILE_PATH,
      startLine: 1, startColumn: 0, endLine: 1, endColumn: FN_LENGTH,
      startIndex: index * FN_LENGTH, endIndex: (index + 1) * FN_LENGTH,
    },
    cyclomaticComplexity: 1,
    hasCircularDep: false,
    unusedVariables: [],
    hasUncaughtException: true,
    parameterCount: 0,
  };
}

function aiPatch(targetFunctionId: string): BedrockPatchSuggestion {
  return {
    mutationId: `ai-${targetFunctionId}`,
    targetFunctionId,
    suggestedSplices: [],
    rationale: "ai",
    confidence: 0.5,
    modelId: "stub-model",
    durationMs: 0,
  };
}

/** A stub engine exposing only what the adapter calls on this path. */
function createStubEngine(functionCount: number, pending: Map<string, Deferred>): MorpheusASTEngine {
  const functions = Array.from({ length: functionCount }, (_, i) => functionNode(i));
  const graph: TopologyGraph = {
    modules: [], functions, edges: [], totalComplexity: functionCount, circularDepCount: 0, durationMs: 0,
  };
  const file: ParsedFile = {
    filePath: FILE_PATH,
    language: "typescript",
    sourceText: "x".repeat(functionCount * FN_LENGTH),
    nodeCount: 1,
    hasErrors: false,
    errors: [],
  };
  const stub = {
    getSampleRepository: () => ({
      label: "stub", description: "stub", files: [{ filePath: FILE_PATH, sourceText: file.sourceText }],
    }),
    parseSourceFiles: async () => ({ files: [file], durationMs: 0 }),
    buildTopologyGraph: async () => graph,
    runSecurityScan: async (): Promise<readonly SecurityScanResult[]> => [],
    injectFault: async (request: FaultInjectionRequest): Promise<FaultInjectionResult> => ({
      targetFunctionId: request.targetFunctionId,
      faultType: request.faultType,
      affectedNodes: [], cascadePath: [], taintPaths: [],
      centralityScore: 0, blastRadiusScore: 0, durationMs: 0,
    }),
    planRemediation: () => ({ splices: [] }),
    generateBedrockPatch: (request: BedrockPatchRequest): Promise<BedrockPatchSuggestion> => {
      const entry = deferred();
      pending.set(request.faultResult.targetFunctionId, entry);
      return entry.promise;
    },
  };
  return stub as unknown as MorpheusASTEngine;
}

/** Lets already-settled promise continuations run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// --- Property 7 ---

describe("Property 7 — stale AI patch answer never overwrites a newer fault", () => {
  const scenario = fc
    .integer({ min: 2, max: 6 })
    .chain((count) =>
      fc.record({
        count: fc.constant(count),
        /** Order in which faults are injected: a permutation of function indices. */
        injectOrder: fc.shuffledSubarray(Array.from({ length: count }, (_, i) => i), {
          minLength: count, maxLength: count,
        }),
        /** Order in which the Bedrock calls settle: a permutation of injection positions. */
        settleOrder: fc.shuffledSubarray(Array.from({ length: count }, (_, i) => i), {
          minLength: count, maxLength: count,
        }),
        rejects: fc.array(fc.boolean(), { minLength: count, maxLength: count }),
      })
    );

  it("lastPatch is the deterministic or AI patch of the latest fault, never an older one", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async ({ count, injectOrder, settleOrder, rejects }) => {
        const pending = new Map<string, Deferred>();
        const adapter = new InfraShieldAdapter(createStubEngine(count, pending));
        await adapter.loadSampleRepository();

        const ids = injectOrder.map((i) => `fn-${i}`);
        for (const id of ids) {
          await adapter.injectFault({ targetFunctionId: id, faultType: "UNCAUGHT_EXCEPTION" });
        }
        const latestId = ids[ids.length - 1]!;

        for (const position of settleOrder) {
          const id = ids[position]!;
          const entry = pending.get(id);
          if (entry === undefined) continue;
          if (rejects[position] === true) entry.reject(new Error("bedrock unavailable"));
          else entry.resolve(aiPatch(id));
          await flush();
        }

        const dashboard = adapter.getSREDashboard();
        expect(dashboard.lastFault?.targetFunctionId).toBe(latestId);
        const patch = dashboard.lastPatch;
        expect(patch).not.toBeNull();
        expect(patch?.targetFunctionId).toBe(latestId);
        expect([`deterministic-${latestId}`, `ai-${latestId}`]).toContain(patch?.mutationId);
      }),
      { numRuns: 100 }
    );
  });
});
