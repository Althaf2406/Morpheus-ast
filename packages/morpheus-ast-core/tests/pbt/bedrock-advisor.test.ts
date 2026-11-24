/**
 * tests/pbt/bedrock-advisor.test.ts
 *
 * The advisor is tested with an injected stub client: no network, no credentials.
 *
 * Contract under test:
 *   - The model sees only the target function's source, so it returns offsets RELATIVE to that
 *     text. The advisor maps them to file offsets using the function's position in the graph.
 *   - The file path always comes from the graph, never from the model.
 *   - Model output is untrusted. If ANY splice is malformed, out of bounds, overlapping or
 *     splits a surrogate pair, the whole patch is rejected (no splices, confidence 0).
 *   - Whatever is returned must be applicable: SurgicalMutator must accept it.
 */

import * as fc from "fast-check";
import type { InvokeModelWithResponseStreamCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { BedrockAdvisor, BedrockAdvisorError } from "../../src/bedrock-advisor/index.js";
import type { BedrockStreamClient } from "../../src/bedrock-advisor/index.js";
import { SurgicalMutator } from "../../src/mutator/index.js";
import type {
  BedrockPatchRequest,
  FaultInjectionResult,
  FunctionNode,
  TopologyGraph,
} from "../../src/contracts.js";

const RUNS = Number(process.env["FC_RUNS"] ?? "300");

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const HEADER = "// file header\n";
const FN_SOURCE = "function target(x: number): number {\n  return risky(x);\n}";
const FILE_SOURCE = `${HEADER}${FN_SOURCE}\n// footer\n`;
const FN_START = HEADER.length;
const CALL = "return risky(x);";
const CALL_START = FN_SOURCE.indexOf(CALL);
const CALL_END = CALL_START + CALL.length;

const targetFn: FunctionNode = {
  id: "fn:a.ts:0:target",
  name: "target",
  filePath: "a.ts",
  range: {
    filePath: "a.ts",
    startLine: 2,
    startColumn: 0,
    endLine: 4,
    endColumn: 1,
    startIndex: FN_START,
    endIndex: FN_START + FN_SOURCE.length,
  },
  cyclomaticComplexity: 1,
  hasCircularDep: false,
  unusedVariables: [],
  hasUncaughtException: true,
  parameterCount: 1,
};

const graph: TopologyGraph = {
  modules: [],
  functions: [targetFn],
  edges: [],
  totalComplexity: 1,
  circularDepCount: 0,
  durationMs: 0,
};

const fault: FaultInjectionResult = {
  targetFunctionId: targetFn.id,
  faultType: "UNCAUGHT_EXCEPTION",
  affectedNodes: [targetFn.id],
  cascadePath: [],
  taintPaths: [],
  centralityScore: 0,
  blastRadiusScore: 1,
  durationMs: 0,
};

const request = (overrides: Partial<BedrockPatchRequest> = {}): BedrockPatchRequest => ({
  faultResult: fault,
  topologyGraph: graph,
  targetFunctionSource: FN_SOURCE,
  ...overrides,
});

const encoder = new TextEncoder();

/** A stub client that streams `text` back in small chunks, recording the request body it received. */
const stubClient = (text: string, seen?: { body: string }): BedrockStreamClient => ({
  send: async (command) => {
    if (seen !== undefined) seen.body = String(command.input.body);
    async function* events(): AsyncGenerator<{ chunk: { bytes: Uint8Array } }> {
      for (let i = 0; i < text.length; i += 9) {
        const part = text.slice(i, i + 9);
        yield { chunk: { bytes: encoder.encode(JSON.stringify({ type: "content_block_delta", delta: { text: part } })) } };
      }
    }
    return { body: events() } as unknown as InvokeModelWithResponseStreamCommandOutput;
  },
});

const reply = (splices: unknown, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ splices, rationale: "because", confidence: 0.8, ...extra });

const validSplice = {
  startIndex: CALL_START,
  endIndex: CALL_END,
  replacement: "try { return risky(x); } catch { return 0; }",
  description: "guard the call",
};

const run = (text: string, req: BedrockPatchRequest = request()) =>
  new BedrockAdvisor({ client: stubClient(text) }).generatePatch(req);

const REJECTED = { splices: 0, confidence: 0 };

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("bedrock advisor", () => {
  const mutator = new SurgicalMutator();

  it("B1: maps function-relative offsets to file offsets and the result applies cleanly", async () => {
    const result = await run(reply([validSplice]));

    expect(result.suggestedSplices).toHaveLength(1);
    const splice = result.suggestedSplices[0]!;
    expect(splice.filePath).toBe("a.ts");
    expect(splice.startIndex).toBe(FN_START + CALL_START);
    expect(splice.endIndex).toBe(FN_START + CALL_END);
    expect(result.confidence).toBeCloseTo(0.8);

    const { mutated } = mutator.applyToString(FILE_SOURCE, result.suggestedSplices);
    expect(mutated).toContain("try { return risky(x); } catch { return 0; }");
    expect(mutated.startsWith(HEADER)).toBe(true);
  });

  it("B2: the request sent to the model contains the function source and asks for relative offsets", async () => {
    const seen = { body: "" };
    await new BedrockAdvisor({ client: stubClient(reply([]), seen) }).generatePatch(request());
    expect(seen.body).toContain("return risky(x);");
    expect(seen.body.toLowerCase()).toContain("relative");
  });

  it("B3: a response that is not JSON yields no splices and confidence 0", async () => {
    const result = await run("sorry, I cannot help with that");
    expect(result.suggestedSplices).toHaveLength(REJECTED.splices);
    expect(result.confidence).toBe(REJECTED.confidence);
  });

  it("B4: JSON wrapped in prose or code fences is still read", async () => {
    const result = await run("Here you go:\n```json\n" + reply([validSplice]) + "\n```\nDone.");
    expect(result.suggestedSplices).toHaveLength(1);
  });

  it("B5: a splice beyond the end of the function is rejected, and so is the whole patch", async () => {
    const result = await run(reply([validSplice, { startIndex: 0, endIndex: FN_SOURCE.length + 1, replacement: "x" }]));
    expect(result.suggestedSplices).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  it("B6: missing offsets are rejected instead of defaulting to 0", async () => {
    const result = await run(reply([{ replacement: "injected();" }]));
    expect(result.suggestedSplices).toHaveLength(0);
  });

  it.each([
    ["negative start", { startIndex: -1, endIndex: 3, replacement: "x" }],
    ["fractional start", { startIndex: 1.5, endIndex: 3, replacement: "x" }],
    ["string offsets", { startIndex: "1", endIndex: "3", replacement: "x" }],
    ["start after end", { startIndex: 9, endIndex: 3, replacement: "x" }],
    ["null replacement", { startIndex: 1, endIndex: 3, replacement: null }],
    ["numeric replacement", { startIndex: 1, endIndex: 3, replacement: 42 }],
  ])("B7: %s is rejected", async (_label, bad) => {
    const result = await run(reply([bad]));
    expect(result.suggestedSplices).toHaveLength(0);
  });

  it("B8: the file path is taken from the graph; a path supplied by the model is ignored", async () => {
    const result = await run(reply([{ ...validSplice, filePath: "/etc/passwd" }]));
    expect(result.suggestedSplices).toHaveLength(1);
    expect(result.suggestedSplices[0]!.filePath).toBe("a.ts");
  });

  it("B9: overlapping splices are rejected", async () => {
    const result = await run(
      reply([
        { startIndex: 0, endIndex: 10, replacement: "a" },
        { startIndex: 5, endIndex: 15, replacement: "b" },
      ])
    );
    expect(result.suggestedSplices).toHaveLength(0);
  });

  it("B10: a boundary inside a surrogate pair is rejected", async () => {
    const source = "const s = '\u{1F600}';";
    const inside = source.indexOf("\u{1F600}") + 1;
    const fnWithEmoji: FunctionNode = {
      ...targetFn,
      range: { ...targetFn.range, startIndex: 0, endIndex: source.length },
    };
    const result = await run(
      reply([{ startIndex: inside, endIndex: inside + 1, replacement: "x" }]),
      request({
        targetFunctionSource: source,
        topologyGraph: { ...graph, functions: [fnWithEmoji] },
      })
    );
    expect(result.suggestedSplices).toHaveLength(0);
  });

  it("B11: confidence is clamped to [0,1] and is 0 when absent or not a number", async () => {
    expect((await run(reply([validSplice], { confidence: 7 }))).confidence).toBe(1);
    expect((await run(reply([validSplice], { confidence: -2 }))).confidence).toBe(0);
    expect((await run(reply([validSplice], { confidence: "high" }))).confidence).toBe(0);
    expect((await run(JSON.stringify({ splices: [validSplice], rationale: "r" }))).confidence).toBe(0);
  });

  it("B12: more than 20 splices are rejected", async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ startIndex: i, endIndex: i, replacement: "x" }));
    expect((await run(reply(many))).suggestedSplices).toHaveLength(0);
  });

  it("B13: a failing client surfaces BedrockAdvisorError", async () => {
    const failing: BedrockStreamClient = {
      send: async () => {
        throw new Error("throttled");
      },
    };
    await expect(new BedrockAdvisor({ client: failing }).generatePatch(request())).rejects.toBeInstanceOf(
      BedrockAdvisorError
    );
  });

  it("B14: a target function missing from the graph, or empty source, is an error before any call", async () => {
    let called = false;
    const spy: BedrockStreamClient = {
      send: async () => {
        called = true;
        throw new Error("should not be called");
      },
    };
    const advisor = new BedrockAdvisor({ client: spy });
    await expect(
      advisor.generatePatch(request({ topologyGraph: { ...graph, functions: [] } }))
    ).rejects.toBeInstanceOf(BedrockAdvisorError);
    await expect(advisor.generatePatch(request({ targetFunctionSource: "" }))).rejects.toBeInstanceOf(
      BedrockAdvisorError
    );
    expect(called).toBe(false);
  });

  it("B16: function source that does not match the function's range is an error", async () => {
    await expect(
      new BedrockAdvisor({ client: stubClient(reply([])) }).generatePatch(
        request({ targetFunctionSource: FN_SOURCE + " // extra" })
      )
    ).rejects.toBeInstanceOf(BedrockAdvisorError);
  });

  it("B15: for arbitrary model output, a returned patch is always in bounds and applies without error", async () => {
    const loose = fc.oneof(
      fc.integer({ min: -5, max: FN_SOURCE.length + 5 }),
      fc.double({ noNaN: true }),
      fc.string({ maxLength: 4 }),
      fc.constant(null)
    );
    const spliceArb = fc.record(
      {
        startIndex: loose,
        endIndex: loose,
        replacement: fc.oneof(fc.string({ maxLength: 12 }), fc.integer(), fc.constant(null)),
        filePath: fc.string({ maxLength: 8 }),
        description: fc.oneof(fc.string({ maxLength: 12 }), fc.integer()),
      },
      { requiredKeys: [] }
    );

    await fc.assert(
      fc.asyncProperty(fc.array(spliceArb, { maxLength: 5 }), async (splices) => {
        const result = await run(reply(splices));
        for (const s of result.suggestedSplices) {
          expect(s.filePath).toBe("a.ts");
          expect(Number.isInteger(s.startIndex) && Number.isInteger(s.endIndex)).toBe(true);
          expect(s.startIndex).toBeGreaterThanOrEqual(FN_START);
          expect(s.endIndex).toBeLessThanOrEqual(FN_START + FN_SOURCE.length);
          expect(s.startIndex).toBeLessThanOrEqual(s.endIndex);
        }
        if (result.suggestedSplices.length > 0) {
          expect(() => mutator.applyToString(FILE_SOURCE, result.suggestedSplices)).not.toThrow();
        } else if (result.rationale.startsWith("Patch rejected")) {
          // A rejected patch carries no confidence. (A valid reply with an empty splice
          // list is allowed and may carry the model's own confidence.)
          expect(result.confidence).toBe(0);
        }
      }),
      { numRuns: RUNS }
    );
  });
});
