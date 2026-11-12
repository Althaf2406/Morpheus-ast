/**
 * bedrock-advisor/index.ts
 *
 * Amazon Bedrock integration for surgical AST patch synthesis.
 *
 * Governance (.kiro/steering/00-skeleton-isolation.md):
 *   - Zero domain-specific vocabulary (no "lambda", "dungeon", "spell", etc.)
 *   - Zero `any` types
 *   - Zero UI framework imports
 *   - Consumes only contracts.ts types
 */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
  type InvokeModelWithResponseStreamCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";

import type {
  BedrockPatchRequest,
  BedrockPatchSuggestion,
  SpliceRange,
} from "../contracts.js";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";
const DEFAULT_REGION = process.env["AWS_REGION"] ?? "us-east-1";
const MAX_TOKENS = 2048;

// ─────────────────────────────────────────────────────────────────────────────
// Types (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeRequestBody {
  anthropic_version: string;
  max_tokens: number;
  messages: ClaudeMessage[];
}

interface ParsedPatchResponse {
  splices: SpliceRange[];
  rationale: string;
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BedrockAdvisor class
// ─────────────────────────────────────────────────────────────────────────────

export class BedrockAdvisor {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(options?: { region?: string; modelId?: string }) {
    this.client = new BedrockRuntimeClient({
      region: options?.region ?? DEFAULT_REGION,
    });
    this.modelId = options?.modelId ?? DEFAULT_MODEL_ID;
  }

  /**
   * Calls Amazon Bedrock to synthesize a surgical AST patch suggestion.
   * Streams the response and assembles SpliceRange recommendations.
   */
  async generatePatch(request: BedrockPatchRequest): Promise<BedrockPatchSuggestion> {
    const startMs = Date.now();
    const mutationId = `bedrock-${startMs}-${Math.random().toString(36).slice(2, 9)}`;

    const prompt = this.buildPrompt(request);
    const body: ClaudeRequestBody = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    };

    let fullText = "";

    try {
      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(body),
      });

      const response: InvokeModelWithResponseStreamCommandOutput =
        await this.client.send(command);

      if (response.body == null) {
        throw new Error("BedrockAdvisor: empty response body from model");
      }

      for await (const event of response.body) {
        if (event.chunk?.bytes != null) {
          const decoded = new TextDecoder().decode(event.chunk.bytes);
          const parsed = JSON.parse(decoded) as { type: string; delta?: { text?: string } };
          if (parsed.type === "content_block_delta" && parsed.delta?.text != null) {
            fullText += parsed.delta.text;
          }
        }
      }
    } catch (err: unknown) {
      // Surface a typed error — never swallow silently
      const message = err instanceof Error ? err.message : String(err);
      throw new BedrockAdvisorError(`Bedrock streaming failed: ${message}`, err);
    }

    const parsed = this.parseModelResponse(fullText, request.faultResult.targetFunctionId);

    return {
      mutationId,
      targetFunctionId: request.faultResult.targetFunctionId,
      suggestedSplices: parsed.splices,
      rationale: parsed.rationale,
      confidence: parsed.confidence,
      modelId: this.modelId,
      durationMs: Date.now() - startMs,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildPrompt(request: BedrockPatchRequest): string {
    const { faultResult, topologyGraph, targetFunctionSource } = request;

    const affectedCount = faultResult.affectedNodes.length;
    const blastPct = (faultResult.blastRadiusScore * 100).toFixed(1);
    const centrality = faultResult.centralityScore.toFixed(4);

    return `You are a surgical AST code repair advisor. Analyze the following fault injection result and source function, then produce a JSON patch recommendation.

## Fault Analysis
- Target function ID: ${faultResult.targetFunctionId}
- Fault type: ${faultResult.faultType}
- Blast radius: ${blastPct}% of graph (${affectedCount} affected nodes)
- Centrality score: ${centrality}
- Cascade depth: ${faultResult.cascadePath.length} hops

## Total graph functions: ${topologyGraph.functions.length}

## Target function source (TypeScript/JavaScript):
\`\`\`typescript
${targetFunctionSource}
\`\`\`

## Task
Produce a JSON object with this exact schema:
{
  "splices": [
    {
      "filePath": "<absolute file path>",
      "startIndex": <byte offset where replacement starts>,
      "endIndex": <byte offset where replacement ends (exclusive)>,
      "replacement": "<the fixed code text>",
      "description": "<one-line explanation>"
    }
  ],
  "rationale": "<2–4 sentence explanation of the fix strategy>",
  "confidence": <float 0.0–1.0>
}

Rules:
1. Only produce splices targeting the EXACT fault type: ${faultResult.faultType}
2. For UNCAUGHT_EXCEPTION: add try/catch wrapping the vulnerable call site
3. For NETWORK_FAILURE: add fallback/retry logic
4. For LATENCY: add timeout guards
5. For EXTREME_PAYLOAD: add input size validation
6. Each splice must be non-overlapping with others
7. Preserve ALL code outside the splice range byte-for-byte
8. Output ONLY the JSON object, no markdown fences`;
  }

  private parseModelResponse(text: string, targetFunctionId: string): ParsedPatchResponse {
    // Strip any accidental markdown fences the model might include
    const cleaned = text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    try {
      const raw = JSON.parse(cleaned) as {
        splices?: unknown[];
        rationale?: unknown;
        confidence?: unknown;
      };

      const splices = this.validateSplices(raw.splices, targetFunctionId);
      const rationale =
        typeof raw.rationale === "string" && raw.rationale.length > 0
          ? raw.rationale
          : "No rationale provided by model.";
      const confidence =
        typeof raw.confidence === "number"
          ? Math.min(1, Math.max(0, raw.confidence))
          : 0.5;

      return { splices, rationale, confidence };
    } catch {
      // Model returned malformed JSON — return empty safe patch
      return {
        splices: [],
        rationale: `Model response could not be parsed as valid JSON. Raw: ${text.slice(0, 200)}`,
        confidence: 0,
      };
    }
  }

  private validateSplices(raw: unknown, filePath: string): SpliceRange[] {
    if (!Array.isArray(raw)) return [];

    const result: SpliceRange[] = [];

    for (const item of raw) {
      if (
        item != null &&
        typeof item === "object" &&
        "startIndex" in item &&
        "endIndex" in item &&
        "replacement" in item
      ) {
        const splice = item as Record<string, unknown>;
        result.push({
          filePath:
            typeof splice["filePath"] === "string" ? splice["filePath"] : filePath,
          startIndex:
            typeof splice["startIndex"] === "number" ? splice["startIndex"] : 0,
          endIndex:
            typeof splice["endIndex"] === "number" ? splice["endIndex"] : 0,
          replacement:
            typeof splice["replacement"] === "string" ? splice["replacement"] : "",
          description:
            typeof splice["description"] === "string"
              ? splice["description"]
              : "AI-suggested patch",
        });
      }
    }

    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error type
// ─────────────────────────────────────────────────────────────────────────────

export class BedrockAdvisorError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "BedrockAdvisorError";
    this.cause = cause;
  }
}
