/**
 * contracts.ts — MORPHEUS-AST Public API
 *
 * This is the ONLY file that the two applications under apps/
 * are permitted to import from packages/morpheus-ast-core.
 *
 * Rules enforced by .kiro/steering/00-skeleton-isolation.md:
 *   - No `any` types anywhere.
 *   - No domain-specific vocabulary (the engine is application-agnostic).
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

/** A source file supplied as text, so no file system is needed (e.g. in a browser). */
export interface VirtualFile {
  readonly filePath: string;
  readonly sourceText: string;
}

/** Input to the parser engine. */
export interface ParseRequest {
  /** Absolute file paths to parse from disk. May be empty. */
  readonly filePaths: readonly string[];
  /** In-memory files to parse in addition to `filePaths`. */
  readonly virtualFiles?: readonly VirtualFile[];
  /** If true, include full source text in ParsedFile. Default false. */
  readonly includeSourceText?: boolean;
}

/** A ready-made repository both apps can load with no upload and no login. */
export interface SampleRepository {
  readonly label: string;
  readonly description: string;
  readonly files: readonly VirtualFile[];
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
  /**
   * Why the function has an uncaught exception path, for example "awaits without try/catch",
   * "calls JSON.parse", "throws" or "calls load which can throw". Empty when there is none.
   */
  readonly uncaughtReasons?: readonly string[];
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
  /**
   * One entry per splice. `startIndex` is an offset in the ORIGINAL source.
   * `replacementLength` is the length of the text that replaced `originalText`,
   * needed to locate the segment in the mutated source when lengths differ.
   */
  readonly originalSegments: readonly {
    startIndex: number;
    originalText: string;
    replacementLength: number;
  }[];
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

// ── External scanner reports ────────────────────────────────────────────────
// Shapes of the third-party reports the engine normalises into SecurityScanResult.
// Reports are untrusted input; the mapper tolerates missing or malformed fields.

/** SonarQube issue (subset of the REST API shape). */
export interface SonarQubeIssue {
  readonly key: string;
  /** BLOCKER, CRITICAL, MAJOR, MINOR or INFO. */
  readonly severity: string;
  /** BUG, VULNERABILITY or CODE_SMELL. */
  readonly type: string;
  readonly message: string;
  /** File path, usually "projectKey:relative/path.ts". */
  readonly component: string;
  readonly textRange?: {
    readonly startLine: number;
    readonly endLine: number;
    readonly startOffset: number;
    readonly endOffset: number;
  };
  /** Rule key, e.g. "typescript:S2068". */
  readonly rule: string;
}

/** Snyk vulnerability (subset). */
export interface SnykVulnerability {
  readonly id: string;
  /** critical, high, medium or low. */
  readonly severity: string;
  readonly title: string;
  readonly description: string;
  readonly packageName: string;
  readonly filePath?: string;
  readonly cvssScore?: number;
  readonly cwe?: readonly string[];
}

/** AWS Security Hub / Security Analyzer finding (subset of the ASFF shape). */
export interface AwsSecurityFinding {
  readonly Id: string;
  readonly Severity: { readonly Label: string };
  readonly Title: string;
  readonly Description: string;
  readonly Resources: readonly { readonly Id: string; readonly Type: string }[];
  readonly Types: readonly string[];
}

/** Aikido finding (subset). */
export interface AikidoFinding {
  readonly id: string;
  /** 1 (critical) to 4 (low). */
  readonly severity_level: number;
  readonly name: string;
  readonly description: string;
  readonly affected_file?: string;
  readonly cwe_ids?: readonly string[];
}

/** Any combination of scanner reports. */
export interface ExternalScanReport {
  readonly sonarqube?: readonly SonarQubeIssue[];
  readonly snyk?: readonly SnykVulnerability[];
  readonly awsSecurity?: readonly AwsSecurityFinding[];
  readonly aikido?: readonly AikidoFinding[];
}

/**
 * Normalises external scanner reports into SecurityScanResult. A finding is attached to a
 * function only when the report gives a line inside that function; whole-file findings
 * have `functionId: null`.
 */
export type IngestExternalFindings = (
  report: ExternalScanReport,
  graph: TopologyGraph
) => readonly SecurityScanResult[];

/** Renders a BugfixSpec as the markdown text of a bugfix.md file. */
export type GenerateBugfixMarkdown = (spec: BugfixSpec) => string;

/** Result of applying splices to text held in memory (no file I/O). */
export interface TextMutationResult {
  readonly mutatedSource: string;
  readonly rollbackRecord: RollbackRecord;
}

/** Applies a splice batch to a string. Same validation and rollback guarantees as the file path. */
export type ApplyMutationToText = (
  source: string,
  splices: readonly SpliceRange[]
) => TextMutationResult;

/** Restores text mutated by ApplyMutationToText. */
export type RollbackMutationText = (mutatedSource: string, record: RollbackRecord) => string;

/** Returns the pre-loaded sample repository (needs no file system, login or upload). */
export type GetSampleRepository = () => SampleRepository;

/** Caller-supplied options for remediation planning. */
export interface RemediationOptions {
  /** True when the target runtime accepts the `cause` option on Error. Defaults to false. */
  readonly errorCause: boolean;
}

/**
 * Plans a deterministic fix for a finding from the source text of its file.
 * Returns null when no safe fix exists. Pure: no file system, environment or shared state.
 */
export type PlanRemediation = (
  finding: SecurityScanResult,
  sourceText: string,
  options?: RemediationOptions
) => MutationRequest | null;

// ── Mutation diff and text fingerprint ──────────────────────────────────────

/**
 * One line of a diff hunk. Line numbers are 1-based; `null` where the line does not exist on that side.
 *
 * `reindent` marks a line present on both sides whose text differs only in its leading
 * whitespace. It stands for one removed and one added line: `beforeText` is the line before
 * the mutation and `text` the line after it. For every other kind `text` is the line itself.
 */
export interface DiffLine {
  readonly kind: "context" | "removed" | "added" | "reindent";
  readonly text: string;
  /** Text of the line before the mutation; present only for `reindent` lines. */
  readonly beforeText?: string;
  /** Line number in the text before the mutation (`null` for added lines). */
  readonly beforeLine: number | null;
  /** Line number in the text after the mutation (`null` for removed lines). */
  readonly afterLine: number | null;
}

/**
 * A contiguous changed region with surrounding context lines. Lines are the pieces of
 * `text.split("\n")`, so replacing `beforeLineCount` lines at `beforeStartLine` of the
 * "before" text by the hunk's `context + added` lines yields the "after" text (and the
 * reverse with `context + removed`). A `reindent` line counts on both sides: it contributes
 * `text` to the after side and `beforeText` to the before side.
 */
export interface DiffHunk {
  readonly beforeStartLine: number;
  readonly beforeLineCount: number;
  readonly afterStartLine: number;
  readonly afterLineCount: number;
  readonly lines: readonly DiffLine[];
}

/** Line diff of one mutation. `hunks` is empty when the mutation changed no line. */
export interface MutationDiff {
  readonly mutationId: string;
  readonly filePath: string;
  readonly hunks: readonly DiffHunk[];
}

/**
 * Builds the diff of a mutation from its RollbackRecord and the text the mutation produced.
 * Pure. `mutatedText` must be the text returned by the mutation that created `record`.
 * `contextLines` is the number of unchanged lines kept around each change (default 2).
 */
export type ComputeMutationDiff = (
  record: RollbackRecord,
  mutatedText: string,
  contextLines?: number
) => MutationDiff;

/** Returns the SHA-256 of the UTF-8 text as 64 lowercase hex characters. */
export type FingerprintText = (text: string) => Promise<string>;

/** A file offered to the code loader, before eligibility filtering. */
export interface CandidateFile {
  readonly path: string;
  readonly content: string;
}

/** Why a candidate file did not become a loaded file. */
export type SkipReason =
  | "unsupported type"
  | "ignored folder"
  | "empty file"
  | "test file"
  | "file too large"
  | "limit exceeded"
  | "duplicate path"
  | "download failed"
  | "parse error";

/** A candidate file that was not loaded, with the reason. */
export interface SkippedFile {
  readonly path: string;
  readonly reason: SkipReason;
}

/** Counts describing a load result. `totalBytes` is the UTF-8 size of the loaded files. */
export interface LoadSummary {
  readonly loadedCount: number;
  readonly totalBytes: number;
  readonly skippedCount: number;
}

/** Output of the code loader: a bounded, deterministic set of files to analyse. */
export interface LoadResult {
  readonly files: readonly VirtualFile[];
  readonly skipped: readonly SkippedFile[];
  readonly summary: LoadSummary;
}

/** Turns candidate files into a bounded LoadResult. Pure: no file system or network. */
export type LoadCode = (candidates: readonly CandidateFile[]) => LoadResult;

/** A parsed `owner/name` repository reference. */
export interface RepositoryRef {
  readonly owner: string;
  readonly name: string;
}

/** A repository fetch failure, returned as a value instead of thrown. */
export interface GitHubFetchError {
  readonly kind: "format" | "rate-limit" | "not-found" | "network";
  readonly message: string;
}

/**
 * Fetches a public GitHub repository's eligible files anonymously (no token) using an injected
 * `fetch`. Never throws for expected failures; they are returned as `{ ok: false }`.
 */
export type FetchGitHubRepository = (
  ref: string,
  fetchFn: typeof fetch
) => Promise<
  | { readonly ok: true; readonly result: LoadResult }
  | { readonly ok: false; readonly error: GitHubFetchError }
>;

/** Parses `owner/name` or a `https://github.com/owner/name` URL. Returns null when unparseable. */
export type ParseRepositoryRef = (value: string) => RepositoryRef | null;

/** The complete public API surface of morpheus-ast-core, as consumed by both apps. */
export interface MorpheusASTEngine {
  readonly computeMutationDiff: ComputeMutationDiff;
  readonly fingerprintText: FingerprintText;
  readonly generateBugfixMarkdown: GenerateBugfixMarkdown;
  readonly ingestExternalFindings: IngestExternalFindings;
  readonly getSampleRepository: GetSampleRepository;
  readonly applyMutationToText: ApplyMutationToText;
  readonly rollbackMutationText: RollbackMutationText;
  readonly parseSourceFiles: ParseSourceFiles;
  readonly buildTopologyGraph: BuildTopologyGraph;
  readonly computeBlastRadius: ComputeBlastRadius;
  readonly injectFault: InjectFault;
  readonly applySurgicalMutation: ApplySurgicalMutation;
  readonly rollbackMutation: RollbackMutation;
  readonly generateBedrockPatch: GenerateBedrockPatch;
  readonly generateBugfixSpec: GenerateBugfixSpec;
  readonly runSecurityScan: RunSecurityScan;
  readonly planRemediation: PlanRemediation;
  readonly loadCode: LoadCode;
  readonly fetchGitHubRepository: FetchGitHubRepository;
  readonly parseRepositoryRef: ParseRepositoryRef;
}
