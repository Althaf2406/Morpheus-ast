/**
 * contracts.ts — MORPHEUS-AST Public API
 *
 * This is the ONLY file that apps/infrashield-chaos and apps/necro-compiler-game
 * are permitted to import from packages/morpheus-ast-core.
 *
 * Rules enforced by .kiro/steering/00-skeleton-isolation.md:
 *   - No `any` types anywhere.
 *   - No domain-specific vocabulary (no "lambda", "dungeon", "spell", "monster").
 *   - No UI framework imports.
 *   - Unidirectional: apps → contracts.ts, never core → apps.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. PARSER TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A single source file location span. */
export interface SourceRange {
  readonly filePath: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly startIndex: number;
  readonly endIndex: number;
}

/** A parsed source file ready for topology analysis. */
export interface ParsedFile {
  readonly filePath: string;
  readonly language: "typescript" | "javascript";
  readonly sourceText: string;
  /** Total number of AST nodes in this file. */
  readonly nodeCount: number;
  /** Whether the parse produced any errors. */
  readonly hasErrors: boolean;
  /** Error messages if hasErrors is true. */
  readonly errors: readonly string[];
}

/** Input to the parser engine. */
export interface ParseRequest {
  /** Absolute file paths to parse. */
  readonly filePaths: readonly string[];
  /** If true, include full source text in ParsedFile. Default false. */
  readonly includeSourceText?: boolean;
}

/** Output of the parser engine. */
export interface ParseResult {
  readonly files: readonly ParsedFile[];
  readonly durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TOPOLOGY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Represents a single function node in the topology graph. */
export interface FunctionNode {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly range: SourceRange;
  /** McCabe Cyclomatic Complexity score. */
  readonly cyclomaticComplexity: number;
  /** True if this function participates in a circular dependency cycle. */
  readonly hasCircularDep: boolean;
  /** Names of unused variables declared inside this function. */
  readonly unusedVariables: readonly string[];
  /** True if this function contains at least one unhandled exception path. */
  readonly hasUncaughtException: boolean;
  /** Number of parameters. */
  readonly parameterCount: number;
}

/** Represents a module (file) cluster in the 3D spatial graph. */
export interface ModuleNode {
  readonly id: string;
  readonly filePath: string;
  /** Functions contained in this module. */
  readonly functionIds: readonly string[];
  /** True if this module is part of a circular dependency chain. */
  readonly isCircularDepMember: boolean;
}

/** A directed call edge between two function nodes. */
export interface CallEdge {
  readonly id: string;
  readonly callerId: string;
  readonly calleeId: string;
  readonly callSite: SourceRange;
  /** True if this edge is part of a circular dependency cycle. */
  readonly isCyclic: boolean;
}

/** The complete 3D spatial topology graph produced by the topology compiler. */
export interface TopologyGraph {
  readonly modules: readonly ModuleNode[];
  readonly functions: readonly FunctionNode[];
  readonly edges: readonly CallEdge[];
  /** Total cyclomatic complexity across all functions. */
  readonly totalComplexity: number;
  /** Number of detected circular dependency cycles. */
  readonly circularDepCount: number;
  readonly durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BLAST-RADIUS TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** The four categories of fault that can be injected into a function node. */
export type FaultType =
  | "LATENCY"
  | "NETWORK_FAILURE"
  | "EXTREME_PAYLOAD"
  | "UNCAUGHT_EXCEPTION";

/** Input to the fault injector. */
export interface FaultInjectionRequest {
  readonly targetFunctionId: string;
  readonly faultType: FaultType;
  /** Multiplier for payload size (used for EXTREME_PAYLOAD). Default 10. */
  readonly payloadMultiplier?: number;
  /** Simulated latency in milliseconds (used for LATENCY). Default 5000. */
  readonly latencyMs?: number;
}

/** A single step in a cascading failure propagation path. */
export interface CascadeStep {
  readonly functionId: string;
  readonly reason: "NO_TRY_CATCH" | "NO_FALLBACK" | "TAINT_PROPAGATION";
  readonly depth: number;
}

/** Taint propagation path for prototype pollution or extreme payload analysis. */
export interface TaintPath {
  readonly sourceId: string;
  readonly sinkId: string;
  readonly path: readonly string[];
  readonly taintType: "PROTOTYPE_POLLUTION" | "PAYLOAD_OVERFLOW" | "DATA_FLOW";
}

/** Result of a fault injection and blast-radius computation. */
export interface FaultInjectionResult {
  readonly targetFunctionId: string;
  readonly faultType: FaultType;
  /** Ordered list of affected function IDs (direct + transitive). */
  readonly affectedNodes: readonly string[];
  /** Ordered cascade path from origin to terminal failure point. */
  readonly cascadePath: readonly CascadeStep[];
  /** Taint propagation paths identified during analysis. */
  readonly taintPaths: readonly TaintPath[];
  /** Betweenness centrality score of the target node (0–1). */
  readonly centralityScore: number;
  /** Blast-radius score: ratio of affected nodes to total nodes (0–1). */
  readonly blastRadiusScore: number;
  readonly durationMs: number;
}

/** Detailed blast-radius result for a given function node. */
export interface BlastRadiusResult {
  readonly functionId: string;
  /** Betweenness centrality rank (1 = highest impact). */
  readonly centralityRank: number;
  /** Betweenness centrality score (0–1). */
  readonly centralityScore: number;
  /** Fraction of total graph nodes reachable from this node (0–1). */
  readonly reachabilityScore: number;
  /** All function IDs reachable from this node. */
  readonly reachableNodes: readonly string[];
  readonly durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SURGICAL MUTATOR TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** A single splice operation: replace [startIndex, endIndex) with replacement. */
export interface SpliceRange {
  readonly filePath: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly replacement: string;
  /** Human-readable description of what this splice does. */
  readonly description: string;
}

/** Record enabling full rollback of a mutation. */
export interface RollbackRecord {
  readonly mutationId: string;
  readonly filePath: string;
  readonly originalSegments: readonly { startIndex: number; originalText: string }[];
  readonly appliedAt: number;
}

/** Result of applying a surgical mutation. */
export interface MutationResult {
  readonly mutationId: string;
  readonly filePath: string;
  readonly splicesApplied: number;
  /** The full mutated source text. */
  readonly mutatedSource: string;
  readonly rollbackRecord: RollbackRecord;
  readonly durationMs: number;
}

/** Input to the surgical mutator. */
export interface MutationRequest {
  /** All splices in a batch. Must be non-overlapping; applied descending by startIndex. */
  readonly splices: readonly SpliceRange[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. AMAZON BEDROCK ADVISOR TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Input to the Bedrock patch advisor. */
export interface BedrockPatchRequest {
  readonly faultResult: FaultInjectionResult;
  readonly topologyGraph: TopologyGraph;
  /** Source text of the target function for in-context analysis. */
  readonly targetFunctionSource: string;
}

/** A single AI-suggested surgical patch from Amazon Bedrock. */
export interface BedrockPatchSuggestion {
  readonly mutationId: string;
  readonly targetFunctionId: string;
  /** Ordered list of splice operations the AI recommends. */
  readonly suggestedSplices: readonly SpliceRange[];
  /** Natural-language explanation of the patch rationale. */
  readonly rationale: string;
  /** Confidence score from the model (0–1). */
  readonly confidence: number;
  readonly modelId: string;
  readonly durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. BUGFIX SPEC TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Structured data for a Kiro-compliant bugfix.md document. */
export interface BugfixSpec {
  readonly specId: string;
  readonly title: string;
  readonly targetFunctionId: string;
  readonly filePath: string;
  /** Current Behavior — description of the defect. */
  readonly currentBehavior: string;
  /** Expected Behavior — description of the correct behavior. */
  readonly expectedBehavior: string;
  /** Unchanged Behavior — regression prevention properties. */
  readonly unchangedBehavior: string;
  /** The fix property: parse(print(mutate(tree))) is syntactically valid. */
  readonly fixProperty: string;
  /** The preservation property: rollback(mutate(tree)) === original. */
  readonly preservationProperty: string;
  /** The mutation request that fixes this bug. */
  readonly suggestedMutation: MutationRequest;
  readonly faultType: FaultType;
  readonly blastRadiusScore: number;
  readonly createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. SECURITY SCAN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Severity level of a security or quality finding. */
export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/** Category of a security or quality finding. */
export type FindingCategory =
  | "VULNERABILITY"
  | "CODE_SMELL"
  | "SECRET_LEAK"
  | "DEPENDENCY_RISK"
  | "UNCAUGHT_EXCEPTION"
  | "UNUSED_VARIABLE"
  | "PROTOTYPE_POLLUTION"
  | "INJECTION"
  | "AUTH_BYPASS";

/** A single finding from a security or static analysis tool. */
export interface SecurityScanResult {
  readonly findingId: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly title: string;
  readonly description: string;
  readonly filePath: string;
  readonly range: SourceRange;
  /** The function ID this finding belongs to, if determinable. */
  readonly functionId: string | null;
  /** The source tool that produced this finding. */
  readonly sourceScanner: "SONARQUBE" | "SNYK" | "AIKIDO" | "AWS_SECURITY_ANALYZER" | "INTERNAL";
  /** CWE identifier if applicable. */
  readonly cweId: string | null;
  /** CVSS score if applicable (0–10). */
  readonly cvssScore: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. PUBLIC ENGINE FUNCTION SIGNATURES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses source files and returns structured parse results.
 * Caller must NOT retain Tree-sitter tree objects — the engine handles cleanup.
 */
export type ParseSourceFiles = (request: ParseRequest) => Promise<ParseResult>;

/** Builds a 3D spatial topology graph from parsed source files. */
export type BuildTopologyGraph = (parsedFiles: readonly ParsedFile[]) => Promise<TopologyGraph>;

/**
 * Computes blast-radius metrics for a single function node.
 * Does NOT inject a fault — pure analysis only.
 */
export type ComputeBlastRadius = (
  functionId: string,
  graph: TopologyGraph
) => Promise<BlastRadiusResult>;

/**
 * Injects a fault into the topology graph and computes the cascading failure path.
 * Does NOT mutate source files.
 */
export type InjectFault = (
  request: FaultInjectionRequest,
  graph: TopologyGraph
) => Promise<FaultInjectionResult>;

/**
 * Applies a surgical line-range AST splice batch to a source file.
 * Returns a MutationResult including the RollbackRecord.
 */
export type ApplySurgicalMutation = (request: MutationRequest) => Promise<MutationResult>;

/**
 * Rolls back a previously applied mutation using its RollbackRecord,
 * restoring the source file to byte-for-byte original state.
 */
export type RollbackMutation = (record: RollbackRecord) => Promise<void>;

/**
 * Calls Amazon Bedrock to synthesize a surgical AST patch suggestion
 * for the given fault injection result.
 */
export type GenerateBedrockPatch = (
  request: BedrockPatchRequest
) => Promise<BedrockPatchSuggestion>;

/**
 * Generates a Kiro-compliant bugfix.md document from a fault injection result
 * and an optional Bedrock patch suggestion.
 */
export type GenerateBugfixSpec = (
  faultResult: FaultInjectionResult,
  graph: TopologyGraph,
  patch?: BedrockPatchSuggestion
) => BugfixSpec;

/**
 * Runs static analysis and security scanning on the parsed files,
 * returning structured findings compatible with SonarQube, Snyk, Aikido,
 * and AWS Security Analyzer output formats.
 */
export type RunSecurityScan = (
  parsedFiles: readonly ParsedFile[]
) => Promise<readonly SecurityScanResult[]>;

// ─────────────────────────────────────────────────────────────────────────────
// 9. ENGINE FACADE INTERFACE
//    Apps import this interface and receive a conforming implementation
//    via the adapter. They never instantiate core classes directly.
// ─────────────────────────────────────────────────────────────────────────────

/** The complete public API surface of morpheus-ast-core, as consumed by both apps. */
export interface MorpheusASTEngine {
  readonly parseSourceFiles: ParseSourceFiles;
  readonly buildTopologyGraph: BuildTopologyGraph;
  readonly computeBlastRadius: ComputeBlastRadius;
  readonly injectFault: InjectFault;
  readonly applySurgicalMutation: ApplySurgicalMutation;
  readonly rollbackMutation: RollbackMutation;
  readonly generateBedrockPatch: GenerateBedrockPatch;
  readonly generateBugfixSpec: GenerateBugfixSpec;
  readonly runSecurityScan: RunSecurityScan;
}
