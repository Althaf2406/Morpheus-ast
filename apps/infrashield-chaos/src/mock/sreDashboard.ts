import type { SREDashboardData } from "../adapter.ts";

// --- Local Finding shape for mock data only ---

export interface MockFinding {
  readonly id: string;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  readonly title: string;
  readonly filePath: string;
  readonly lineNumber: number;
}

// --- Security findings mock ---

export const mockSecurityFindings: readonly MockFinding[] = [
  {
    id:         "find-001",
    severity:   "CRITICAL",
    title:      "SQL Injection via unsanitised query param",
    filePath:   "src/database-client.ts",
    lineNumber: 42,
  },
  {
    id:         "find-002",
    severity:   "HIGH",
    title:      "Missing error boundary in async handler",
    filePath:   "src/api-gateway.ts",
    lineNumber: 17,
  },
  {
    id:         "find-003",
    severity:   "HIGH",
    title:      "Prototype pollution via Object.assign",
    filePath:   "src/user-service.ts",
    lineNumber: 88,
  },
  {
    id:         "find-004",
    severity:   "MEDIUM",
    title:      "Unhandled promise rejection in event emitter",
    filePath:   "src/event-bus.ts",
    lineNumber: 23,
  },
  {
    id:         "find-005",
    severity:   "LOW",
    title:      "Unused variable `tempBuffer` leaks memory",
    filePath:   "src/database-client.ts",
    lineNumber: 109,
  },
];

// --- Healthy SRE dashboard mock ---

export const mockHealthySREDashboard: SREDashboardData = {
  totalFunctions:   12,
  totalEdges:       15,
  totalCircularDeps: 1,
  avgComplexity:    4.2,
  maxComplexity:    8,
  criticalFindings: 0,
  highFindings:     0,
  lastFault:        null,
  lastPatch:        null,
};

// --- Faulted SRE dashboard mock ---

export const mockFaultedSREDashboard: SREDashboardData = {
  totalFunctions:   12,
  totalEdges:       15,
  totalCircularDeps: 1,
  avgComplexity:    4.2,
  maxComplexity:    8,
  criticalFindings: 1,
  highFindings:     2,
  lastFault: {
    targetFunctionId: "fn-003",
    faultType:        "UNCAUGHT_EXCEPTION",
    affectedNodes:    ["fn-004", "fn-005", "fn-006", "fn-008"],
    cascadePath: [
      { functionId: "fn-004", reason: "NO_TRY_CATCH",       depth: 1 },
      { functionId: "fn-005", reason: "NO_FALLBACK",        depth: 1 },
      { functionId: "fn-006", reason: "TAINT_PROPAGATION",  depth: 2 },
      { functionId: "fn-008", reason: "NO_TRY_CATCH",       depth: 3 },
    ],
    taintPaths: [
      {
        sourceId:  "fn-003",
        sinkId:    "fn-008",
        path:      ["fn-003", "fn-006", "fn-008"],
        taintType: "DATA_FLOW",
      },
    ],
    centralityScore:  0.88,
    blastRadiusScore: 0.75,
    durationMs:       124,
  },
  lastPatch: {
    mutationId:        "patch-9a2f",
    targetFunctionId:  "fn-003",
    suggestedSplices: [
      {
        filePath:    "src/api-gateway.ts",
        startIndex:  1024,
        endIndex:    1180,
        replacement: [
          "async function routeRequest(req: Request): Promise<Response> {",
          "  try {",
          "    const handler = resolveHandler(req.path);",
          "    return await handler(req);",
          "  } catch (err: unknown) {",
          "    return errorResponse(err);",
          "  }",
          "}",
        ].join("\n"),
        description: "Wrap routeRequest body in try/catch to prevent uncaught exceptions",
      },
    ],
    rationale:  "routeRequest propagates uncaught exceptions directly to callers with no fallback. Wrapping in try/catch isolates the failure and returns a structured error response, preventing cascade through fn-004, fn-006, and fn-008.",
    confidence: 0.87,
    modelId:    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    durationMs: 1842,
  },
};
