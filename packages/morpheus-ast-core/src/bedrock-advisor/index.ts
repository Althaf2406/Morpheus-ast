/**
 * bedrock-advisor/index.ts
 *
 * Amazon Bedrock integration for surgical AST patch suggestions.
 *
 * Trust model: the model's output is untrusted input. It sees only the target function's
 * source, so it returns offsets RELATIVE to that text. The advisor
 *   - takes the file path from the topology graph, never from the model,
 *   - maps relative offsets to file offsets using the function's position in the graph,
 *   - rejects the WHOLE patch if any splice is malformed, out of bounds, overlapping,
 *     or splits a surrogate pair (no splices, confidence 0, reason in the rationale).
 * A non-empty suggestion is therefore always applicable by SurgicalMutator.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary
 *   - Zero `any` types
 *   - Zero UI framework imports
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  type InvokeModelWithResponseStreamCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";

import type {
  BedrockPatchRequest,
  BedrockPatchSuggestion,
  FunctionNode,
  SpliceRange,
} from "../contracts.js";
import { splitsSurrogatePair } from "../mutator/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const DEFAULT_REGION = process.env["AWS_REGION"] ?? "us-east-1";
const MAX_TOKENS = 2048;

/** Upper bounds on what a single suggestion may contain. */
const MAX_SPLICES = 20;
const MAX_REPLACEMENT_CHARS = 20_000;
const MAX_DESCRIPTION_CHARS = 200;
const MAX_RATIONALE_CHARS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClaudeRequestBody {
  anthropic_version: string;
  max_tokens: number;
  messages: { role: "user" | "assistant"; content: string }[];
}

type Validation =
  | { readonly ok: true; readonly splices: SpliceRange[]; readonly rationale: string; readonly confidence: number }
  | { readonly ok: false; readonly reason: string; readonly rationale: string };

/** The only client capability the advisor needs; lets tests inject a stub instead of calling AWS. */
export interface BedrockStreamClient {
  send(
    command: InvokeModelWithResponseStreamCommand
  ): Promise<InvokeModelWithResponseStreamCommandOutput>;
}

export class BedrockAdvisorError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BedrockAdvisorError";
    this.cause = cause;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BedrockAdvisor
// ─────────────────────────────────────────────────────────────────────────────

export class BedrockAdvisor {
  private readonly client: BedrockStreamClient;
  private readonly modelId: string;

  constructor(options?: { region?: string; modelId?: string; client?: BedrockStreamClient }) {
    this.client =
      options?.client ?? new BedrockRuntimeClient({ region: options?.region ?? DEFAULT_REGION });
    this.modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  }

  /**
   * Asks the model for a patch and returns a validated suggestion.
   * Throws BedrockAdvisorError for an invalid request or a failed call. A bad model
   * response does not throw: it yields a suggestion with no splices and confidence 0.
   */
  async generatePatch(request: BedrockPatchRequest): Promise<BedrockPatchSuggestion> {
    const startMs = Date.now();
    const target = this.requireTarget(request);

    const body: ClaudeRequestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: this.buildPrompt(request) }],
    };

    const text = await this.complete(body);
    const validation = this.validate(text, target, request.targetFunctionSource);

    return {
      mutationId: `bedrock-${startMs}-${Math.random().toString(36).slice(2, 9)}`,
      targetFunctionId: target.id,
      suggestedSplices: validation.ok ? validation.splices : [],
      rationale: validation.ok
        ? validation.rationale
        : `Patch rejected: ${validation.reason}. ${validation.rationale}`.trim().slice(0, MAX_RATIONALE_CHARS),
      confidence: validation.ok ? validation.confidence : 0,
      modelId: this.modelId,
      durationMs: Date.now() - startMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Request checks and the model call
  // ─────────────────────────────────────────────────────────────────────────

  private requireTarget(request: BedrockPatchRequest): FunctionNode {
    const id = request.faultResult.targetFunctionId;
    const fn = request.topologyGraph.functions.find((f) => f.id === id);
    if (fn === undefined) {
      throw new BedrockAdvisorError(`Target function "${id}" is not in the topology graph.`);
    }
    const source = request.targetFunctionSource;
    if (source.length === 0) {
      throw new BedrockAdvisorError("targetFunctionSource is empty; the model has nothing to patch.");
    }
    if (fn.range.endIndex - fn.range.startIndex !== source.length) {
      throw new BedrockAdvisorError(
        `targetFunctionSource (${source.length} chars) does not match the function range ` +
          `(${fn.range.endIndex - fn.range.startIndex} chars); offsets could not be mapped safely.`
      );
    }
    return fn;
  }

  private async complete(body: ClaudeRequestBody): Promise<string> {
    let fullText = "";
    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      });
      const response = await this.client.send(command);
      if (response.body == null) {
        throw new Error("empty response body from model");
      }
      for await (const event of response.body) {
        if (event.chunk?.bytes != null) {
          const decoded = new TextDecoder().decode(event.chunk.bytes);
          const parsed = JSON.parse(decoded) as { type?: string; delta?: { text?: string } };
          if (parsed.type === "content_block_delta" && typeof parsed.delta?.text === "string") {
            fullText += parsed.delta.text;
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BedrockAdvisorError(`Bedrock streaming failed: ${message}`, err);
    }
    return fullText;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Prompt
  // ─────────────────────────────────────────────────────────────────────────

  private buildPrompt(request: BedrockPatchRequest): string {
    const { faultResult, topologyGraph, targetFunctionSource } = request;
    const blastPct = (faultResult.blastRadiusScore * 100).toFixed(1);

    return `You are a surgical code repair advisor. Analyze the fault and the function below, then reply with one JSON object.

## Fault analysis
- Target function id: ${faultResult.targetFunctionId}
- Fault type: ${faultResult.faultType}
- Blast radius: ${blastPct}% of the graph (${faultResult.affectedNodes.length} affected nodes)
- Centrality score: ${faultResult.centralityScore.toFixed(4)}
- Cascade depth: ${faultResult.cascadePath.length} hops
- Functions in graph: ${topologyGraph.functions.length}

## Target function source
\`\`\`typescript
${targetFunctionSource}
\`\`\`

## Task
Reply with exactly this JSON shape and nothing else:
{
  "splices": [
    { "startIndex": <int>, "endIndex": <int>, "replacement": "<new code>", "description": "<one line>" }
  ],
  "rationale": "<2 to 4 sentences>",
  "confidence": <number from 0 to 1>
}

Rules:
1. Offsets are relative to the start of the function source shown above: 0 is its first character.
   They are 0-based UTF-16 code unit indexes, and endIndex is exclusive. Do not use file offsets.
2. 0 <= startIndex <= endIndex <= ${targetFunctionSource.length}.
3. Splices must not overlap. Use at most ${MAX_SPLICES}.
4. Address only the fault type ${faultResult.faultType}:
   UNCAUGHT_EXCEPTION: wrap the vulnerable call in try/catch.
   NETWORK_FAILURE: add a fallback or retry.
   LATENCY: add a timeout guard.
   EXTREME_PAYLOAD: add input size validation.
5. Keep all code outside the splice ranges exactly as it is.
6. Output only the JSON object.`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation of untrusted model output
  // ─────────────────────────────────────────────────────────────────────────

  private validate(text: string, target: FunctionNode, source: string): Validation {
    const parsed = extractJsonObject(text);
    if (parsed === null) {
      return { ok: false, reason: "the response was not a JSON object", rationale: "" };
    }

    const rationale = typeof parsed["rationale"] === "string" ? parsed["rationale"].slice(0, MAX_RATIONALE_CHARS) : "";
    const rawConfidence = parsed["confidence"];
    const confidence =
      typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : 0;

    const rawSplices = parsed["splices"];
    if (!Array.isArray(rawSplices)) {
      return { ok: false, reason: "'splices' is missing or not an array", rationale };
    }
    if (rawSplices.length > MAX_SPLICES) {
      return { ok: false, reason: `more than ${MAX_SPLICES} splices`, rationale };
    }

    const relative: { start: number; end: number; replacement: string; description: string }[] = [];
    for (let i = 0; i < rawSplices.length; i++) {
      const problem = checkSplice(rawSplices[i], source);
      if (typeof problem === "string") {
        return { ok: false, reason: `splice ${i}: ${problem}`, rationale };
      }
      relative.push(problem);
    }

    const ordered = [...relative].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1]!;
      const cur = ordered[i]!;
      if (cur.start < prev.end || cur.start === prev.start) {
        return { ok: false, reason: "splices overlap or share a start offset", rationale };
      }
    }

    const splices: SpliceRange[] = relative.map((s) => ({
      filePath: target.filePath,
      startIndex: target.range.startIndex + s.start,
      endIndex: target.range.startIndex + s.end,
      replacement: s.replacement,
      description: s.description,
    }));
    return { ok: true, splices, rationale: rationale || "No rationale provided by model.", confidence };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the first JSON object in the text, tolerating prose or code fences around it. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const value: unknown = JSON.parse(text.slice(first, last + 1));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Returns the validated splice (function-relative) or a short reason it was rejected. */
function checkSplice(
  raw: unknown,
  source: string
): { start: number; end: number; replacement: string; description: string } | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "not an object";
  const item = raw as Record<string, unknown>;

  const start = item["startIndex"];
  const end = item["endIndex"];
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)) {
    return "startIndex and endIndex must be integers";
  }
  if (start < 0 || end < start || end > source.length) {
    return `range [${start}, ${end}) is outside the function (length ${source.length})`;
  }
  if (splitsSurrogatePair(source, start) || splitsSurrogatePair(source, end)) {
    return "a boundary falls inside a surrogate pair";
  }

  const replacement = item["replacement"];
  if (typeof replacement !== "string") return "replacement must be a string";
  if (replacement.length > MAX_REPLACEMENT_CHARS) return "replacement is too long";

  const description =
    typeof item["description"] === "string" && item["description"].length > 0
      ? item["description"].slice(0, MAX_DESCRIPTION_CHARS)
      : "AI-suggested patch";

  return { start, end, replacement, description };
}
