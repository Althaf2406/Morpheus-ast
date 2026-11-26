/**
 * apps/infrashield-chaos/src/adapter.ts
 *
 * InfraShield 3D — Core Engine Adapter (Person A stub)
 *
 * This file is the ONLY connection between the UI layer (Person B) and
 * packages/morpheus-ast-core. Types come from contracts.ts; the only value import is createEngine from core src/index.ts (composition root).
 *
 * Person B imports from this adapter only — never from morpheus-ast-core directly.
 *
 * Governance: .kiro/steering/00-skeleton-isolation.md (inclusion: always)
 */

import type {
  MorpheusASTEngine,
  TopologyGraph,
  FunctionNode,
  FaultInjectionResult,
  FaultInjectionRequest,
  FaultType,
  BlastRadiusResult,
  BedrockPatchSuggestion,
  BedrockPatchRequest,
  BugfixSpec,
  SecurityScanResult,
  ParseRequest,
  VirtualFile,
  MutationRequest,
  MutationResult,
  RollbackRecord,
  ExternalScanReport,
} from "../../../packages/morpheus-ast-core/src/contracts.js";
import { createEngine } from "../../../packages/morpheus-ast-core/src/index.js";

export type { FaultType };

// ─────────────────────────────────────────────────────────────────────────────
// UI-facing data shapes (domain-specific names live HERE, not in core)
// ─────────────────────────────────────────────────────────────────────────────

/** A function node enriched with Cyber City 3D display metadata. */
export interface CityNode {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  /** Cyclomatic complexity — drives building height in the 3D city. */
  readonly complexity: number;
  /** Whether this node is currently faulted. */
  readonly isFaulted: boolean;
  /** Whether this node is in the active blast-radius cascade. */
  readonly isAffected: boolean;
  /** Betweenness centrality score drives road width. */
  readonly centralityScore: number;
}

/** An edge between two city nodes (road/highway). */
export interface CityEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly isCyclic: boolean;
  readonly isCascading: boolean;
}

/** Full Cyber City layout passed to Person B's Three.js renderer. */
export interface CyberCityLayout {
  readonly nodes: readonly CityNode[];
  readonly edges: readonly CityEdge[];
  readonly activeBlastRadius: BlastRadiusResult | null;
  readonly activeFault: FaultInjectionResult | null;
  readonly securityFindings: readonly SecurityScanResult[];
}

/** SRE Dashboard telemetry panel data. */
export interface SREDashboardData {
  readonly totalFunctions: number;
  readonly totalEdges: number;
  readonly totalCircularDeps: number;
  readonly avgComplexity: number;
  readonly maxComplexity: number;
  readonly criticalFindings: number;
  readonly highFindings: number;
  readonly lastFault: FaultInjectionResult | null;
  readonly lastPatch: BedrockPatchSuggestion | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// InfraShieldAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class InfraShieldAdapter {
  private engine: MorpheusASTEngine;
  private currentGraph: TopologyGraph | null = null;
  private currentFindings: SecurityScanResult[] = [];
  private lastFault: FaultInjectionResult | null = null;
  private lastPatch: BedrockPatchSuggestion | null = null;
  private lastMutation: MutationResult | null = null;
  /** The fault and patch active when the last mutation was applied, brought back by rollback. */
  private preMutation: { readonly fault: FaultInjectionResult; readonly patch: BedrockPatchSuggestion | null } | null = null;
  /** Source text of the loaded files, so Bedrock can be given the real function source. */
  private readonly sources = new Map<string, string>();
  /** In-memory Virtual_Copy of the sample repository; mutations never touch the file system. */
  private readonly virtualSources = new Map<string, string>();
  /** The healthy sample as first loaded, restored by reset(). */
  private healthySnapshot: readonly VirtualFile[] = [];

  constructor(engine: MorpheusASTEngine) {
    this.engine = engine;
  }

  // ─── Repository loading ──────────────────────────────────────────────────

  async loadRepository(filePaths: readonly string[]): Promise<CyberCityLayout> {
    await this.analyze({ filePaths, includeSourceText: true });
    return this.buildCityLayout(null, null);
  }

  /** Loads the pre-loaded sample repository: no upload, login or file system needed. */
  async loadSampleRepository(): Promise<CyberCityLayout> {
    const sample = this.engine.getSampleRepository();
    this.healthySnapshot = sample.files;
    this.restoreVirtualSources();
    await this.reanalyzeVirtual();
    return this.buildCityLayout(null, null);
  }

  /** Restores the healthy sample and clears the fault, patch and mutation state. */
  async reset(): Promise<CyberCityLayout> {
    this.restoreVirtualSources();
    await this.reanalyzeVirtual();
    this.lastFault = null;
    this.lastPatch = null;
    this.lastMutation = null;
    this.preMutation = null;
    return this.buildCityLayout(null, null);
  }

  // ─── Fault injection ─────────────────────────────────────────────────────

  async injectFault(request: FaultInjectionRequest): Promise<CyberCityLayout> {
    this.requireGraph();

    const fault = await this.engine.injectFault(request, this.currentGraph!);
    this.lastFault = fault;
    this.preMutation = null; // a new fault supersedes the one a rollback would bring back
    // A patch belongs to one fault; the rule-based patch replaces any earlier one.
    this.lastPatch = this.buildDeterministicPatch(fault);

    // The AI patch arrives later; the UI can poll getSREDashboard().lastPatch.
    void this.requestAIPatch(fault);

    return this.buildCityLayout(fault, null);
  }

  // ─── Blast-radius query ──────────────────────────────────────────────────

  async queryBlastRadius(functionId: string): Promise<BlastRadiusResult> {
    this.requireGraph();
    return this.engine.computeBlastRadius(functionId, this.currentGraph!);
  }

  // ─── Bugfix spec generation ───────────────────────────────────────────────

  generateBugfixSpec(): BugfixSpec {
    if (this.lastFault == null || this.currentGraph == null) {
      throw new AdapterError("generateBugfixSpec: no active fault injection result. Run injectFault() first.");
    }
    return this.engine.generateBugfixSpec(
      this.lastFault,
      this.currentGraph,
      this.lastPatch ?? undefined
    );
  }

  // --- Bugfix export (1-click bugfix.md) ---------------------------------

  /** The markdown text of bugfix.md for the last fault simulation. */
  generateBugfixMarkdown(): string {
    return this.engine.generateBugfixMarkdown(this.generateBugfixSpec());
  }

  /** The 1-click export: a file name and content for the UI to offer as a download. */
  generateBugfixFile(): { fileName: string; content: string } {
    return { fileName: "bugfix.md", content: this.generateBugfixMarkdown() };
  }

  // --- External scanner reports ------------------------------------------

  /** Adds normalised SonarQube, Snyk, AWS Security Analyzer and Aikido findings to the risk report. */
  ingestExternalFindings(report: ExternalScanReport): CyberCityLayout {
    this.requireGraph();
    this.currentFindings = [
      ...this.currentFindings,
      ...this.engine.ingestExternalFindings(report, this.currentGraph!),
    ];
    return this.buildCityLayout(this.lastFault, null);
  }
  // ─── Surgical mutation ────────────────────────────────────────────────────

  async applyMutation(request: MutationRequest): Promise<MutationResult> {
    const first = request.splices[0];
    if (first === undefined) throw new AdapterError("applyMutation: request has no splices.");
    const source = this.virtualSources.get(first.filePath);
    if (source === undefined) {
      throw new AdapterError(`applyMutation: no virtual source for ${first.filePath}.`);
    }

    const text = this.engine.applyMutationToText(source, request.splices);
    this.virtualSources.set(first.filePath, text.mutatedSource);
    const result: MutationResult = {
      mutationId: text.rollbackRecord.mutationId,
      filePath: first.filePath,
      splicesApplied: request.splices.length,
      mutatedSource: text.mutatedSource,
      rollbackRecord: text.rollbackRecord,
      durationMs: 0,
    };
    this.lastMutation = result;
    this.preMutation = this.lastFault === null ? null : { fault: this.lastFault, patch: this.lastPatch };
    await this.reanalyzeVirtual();
    return result;
  }

  async rollbackLastMutation(): Promise<void> {
    const mutation = this.lastMutation;
    if (mutation == null) {
      throw new AdapterError("rollbackLastMutation: no mutation to roll back.");
    }
    const current = this.virtualSources.get(mutation.filePath);
    if (current === undefined) {
      throw new AdapterError(`rollbackLastMutation: no virtual source for ${mutation.filePath}.`);
    }

    this.virtualSources.set(
      mutation.filePath,
      this.engine.rollbackMutationText(current, mutation.rollbackRecord)
    );
    this.lastMutation = null;
    await this.reanalyzeVirtual();
    await this.restoreFaultAfterRollback();
  }

  /** The current text of a file in the Virtual_Copy, or undefined when the file is not loaded. */
  getSourceText(filePath: string): string | undefined {
    return this.virtualSources.get(filePath);
  }

  /** The City_Layout of the current analysis, including any active fault. */
  getLayout(): CyberCityLayout {
    this.requireGraph();
    return this.buildCityLayout(this.lastFault, null);
  }

  async rollbackRecord(record: RollbackRecord): Promise<void> {
    await this.engine.rollbackMutation(record);
  }

  // ─── SRE dashboard snapshot ───────────────────────────────────────────────

  getSREDashboard(): SREDashboardData {
    const graph = this.currentGraph;
    if (graph == null) {
      return {
        totalFunctions: 0, totalEdges: 0, totalCircularDeps: 0,
        avgComplexity: 0, maxComplexity: 0, criticalFindings: 0,
        highFindings: 0, lastFault: null, lastPatch: null,
      };
    }

    const complexities = graph.functions.map((f) => f.cyclomaticComplexity);
    const avg = complexities.reduce((a, b) => a + b, 0) / Math.max(complexities.length, 1);
    const max = complexities.reduce((a, b) => Math.max(a, b), 0);

    return {
      totalFunctions: graph.functions.length,
      totalEdges: graph.edges.length,
      totalCircularDeps: graph.circularDepCount,
      avgComplexity: Math.round(avg * 10) / 10,
      maxComplexity: max,
      criticalFindings: this.currentFindings.filter((f) => f.severity === "CRITICAL").length,
      highFindings: this.currentFindings.filter((f) => f.severity === "HIGH").length,
      lastFault: this.lastFault,
      lastPatch: this.lastPatch,
    };
  }

  // ─── Live Engine Inspector data ───────────────────────────────────────────

  getInspectorTelemetry(): {
    functionCount: number;
    edgeCount: number;
    lastFault: FaultInjectionResult | null;
    lastMutationId: string | null;
    findingCount: number;
  } {
    return {
      functionCount: this.currentGraph?.functions.length ?? 0,
      edgeCount: this.currentGraph?.edges.length ?? 0,
      lastFault: this.lastFault,
      lastMutationId: this.lastMutation?.mutationId ?? null,
      findingCount: this.currentFindings.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildCityLayout(
    fault: FaultInjectionResult | null,
    blastRadius: BlastRadiusResult | null
  ): CyberCityLayout {
    const graph = this.currentGraph!;
    const affectedSet = new Set(fault?.affectedNodes ?? []);

    const nodes: CityNode[] = graph.functions.map((fn) => ({
      id: fn.id,
      name: fn.name,
      filePath: fn.filePath,
      complexity: fn.cyclomaticComplexity,
      isFaulted: fault?.targetFunctionId === fn.id,
      isAffected: affectedSet.has(fn.id),
      centralityScore: 0, // Populated lazily by Person B on demand
    }));

    const cascadeSet = new Set(fault?.cascadePath.map((s) => s.functionId) ?? []);

    const edges: CityEdge[] = graph.edges.map((e) => ({
      id: e.id,
      sourceId: e.callerId,
      targetId: e.calleeId,
      isCyclic: e.isCyclic,
      isCascading:
        cascadeSet.has(e.callerId) || cascadeSet.has(e.calleeId),
    }));

    return {
      nodes,
      edges,
      activeBlastRadius: blastRadius,
      activeFault: fault,
      securityFindings: this.currentFindings,
    };
  }

  /** The finding that describes a fault, or null when its fault type has no remediation category. */
  private findingForFault(fault: FaultInjectionResult, fn: FunctionNode): SecurityScanResult | null {
    if (fault.faultType !== "UNCAUGHT_EXCEPTION") return null;

    const existing = this.currentFindings.find(
      (f) => f.functionId === fn.id && f.category === "UNCAUGHT_EXCEPTION"
    );
    if (existing !== undefined) return existing;

    return {
      findingId: `fault-${fn.id}`,
      severity: "HIGH",
      category: "UNCAUGHT_EXCEPTION",
      title: `Uncaught exception in ${fn.name}`,
      description: `An injected UNCAUGHT_EXCEPTION fault escapes ${fn.name} without a handler.`,
      filePath: fn.filePath,
      range: fn.range,
      functionId: fn.id,
      sourceScanner: "INTERNAL",
      cweId: null,
      cvssScore: null,
    };
  }

  /** The rule-based patch for a fault, or null when no safe fix exists. No AI involved. */
  private buildDeterministicPatch(fault: FaultInjectionResult): BedrockPatchSuggestion | null {
    const fn = this.currentGraph?.functions.find((f) => f.id === fault.targetFunctionId);
    if (fn === undefined) return null;

    const source = this.virtualSources.get(fn.filePath) ?? this.sources.get(fn.filePath);
    const finding = this.findingForFault(fault, fn);
    if (source === undefined || finding === null) return null;

    const plan = this.engine.planRemediation(finding, source, { errorCause: true });
    if (plan === null) return null;

    return {
      mutationId: `deterministic-${fn.id}`,
      targetFunctionId: fn.id,
      suggestedSplices: plan.splices,
      rationale:
        "This patch comes from rule-based deterministic remediation. It was not generated by an AI model.",
      confidence: 1,
      modelId: "deterministic",
      durationMs: 0,
    };
  }

  /** Asks Bedrock for a patch when the function source is available; never throws or logs. */
  private async requestAIPatch(fault: FaultInjectionResult): Promise<void> {
    const patchRequest = this.buildBedrockRequest();
    if (patchRequest === null) return;

    try {
      const patch = await this.engine.generateBedrockPatch(patchRequest);
      if (this.lastFault === fault) this.lastPatch = patch; // ignore answers for an older fault
    } catch {
      // Best effort: no credentials, a browser, or a rejected suggestion keeps the rule-based patch.
    }
  }

  /** The request for Bedrock, or null when the source of the faulted function is not available. */
  private buildBedrockRequest(): BedrockPatchRequest | null {
    const fault = this.lastFault;
    const graph = this.currentGraph;
    if (fault === null || graph === null) return null;

    const fn = graph.functions.find((f) => f.id === fault.targetFunctionId);
    const file = fn === undefined ? undefined : this.sources.get(fn.filePath);
    if (fn === undefined || file === undefined) return null;

    return {
      faultResult: fault,
      topologyGraph: graph,
      targetFunctionSource: file.slice(fn.range.startIndex, fn.range.endIndex),
    };
  }

  private async analyze(request: ParseRequest): Promise<void> {
    const parseResult = await this.engine.parseSourceFiles(request);
    this.currentGraph = await this.engine.buildTopologyGraph(parseResult.files);
    this.currentFindings = [...(await this.engine.runSecurityScan(parseResult.files))];

    this.sources.clear();
    for (const file of parseResult.files) {
      if (file.sourceText.length > 0) this.sources.set(file.filePath, file.sourceText);
    }
    // A new repository invalidates anything derived from the previous one.
    this.lastFault = null;
    this.lastPatch = null;
  }

  private async reanalyzeVirtual(): Promise<void> {
    const virtualFiles = [...this.virtualSources].map(([filePath, sourceText]) => ({ filePath, sourceText }));
    await this.analyze({ filePaths: [], virtualFiles, includeSourceText: true });
  }

  /** Re-runs the fault that was active before the rolled-back mutation on the restored source. */
  private async restoreFaultAfterRollback(): Promise<void> {
    const before = this.preMutation;
    this.preMutation = null;
    if (before === null) return;

    this.lastFault = await this.engine.injectFault(
      { targetFunctionId: before.fault.targetFunctionId, faultType: before.fault.faultType },
      this.currentGraph!
    );
    this.lastPatch = before.patch;
  }

  private restoreVirtualSources(): void {
    this.virtualSources.clear();
    for (const file of this.healthySnapshot) this.virtualSources.set(file.filePath, file.sourceText);
  }

  private requireGraph(): void {
    if (this.currentGraph == null) {
      throw new AdapterError("No repository loaded. Call loadRepository() first.");
    }
  }
}

/** Composition root: builds the adapter on top of the real core engine. */
export function createInfraShieldAdapter(): InfraShieldAdapter {
  return new InfraShieldAdapter(createEngine());
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}
