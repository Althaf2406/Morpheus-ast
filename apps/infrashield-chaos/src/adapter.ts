/**
 * apps/infrashield-chaos/src/adapter.ts
 *
 * InfraShield 3D — Core Engine Adapter (Person A stub)
 *
 * This file is the ONLY connection between the UI layer (Person B) and
 * packages/morpheus-ast-core. It imports exclusively from contracts.ts.
 *
 * Person B imports from this adapter only — never from morpheus-ast-core directly.
 *
 * Governance: .kiro/steering/00-skeleton-isolation.md (inclusion: always)
 */

import type {
  MorpheusASTEngine,
  TopologyGraph,
  FaultInjectionResult,
  FaultInjectionRequest,
  BlastRadiusResult,
  BedrockPatchSuggestion,
  BedrockPatchRequest,
  BugfixSpec,
  SecurityScanResult,
  ParseRequest,
  MutationRequest,
  MutationResult,
  RollbackRecord,
} from "../../../packages/morpheus-ast-core/src/contracts.js";

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

  constructor(engine: MorpheusASTEngine) {
    this.engine = engine;
  }

  // ─── Repository loading ──────────────────────────────────────────────────

  async loadRepository(filePaths: readonly string[]): Promise<CyberCityLayout> {
    const request: ParseRequest = { filePaths, includeSourceText: true };
    const parseResult = await this.engine.parseSourceFiles(request);

    this.currentGraph = await this.engine.buildTopologyGraph(parseResult.files);
    this.currentFindings = [
      ...(await this.engine.runSecurityScan(parseResult.files)),
    ];

    return this.buildCityLayout(null, null);
  }

  // ─── Fault injection ─────────────────────────────────────────────────────

  async injectFault(request: FaultInjectionRequest): Promise<CyberCityLayout> {
    this.requireGraph();

    this.lastFault = await this.engine.injectFault(request, this.currentGraph!);

    // Fire Bedrock patch request asynchronously — UI can poll lastPatch
    void this.engine
      .generateBedrockPatch(this.buildBedrockRequest())
      .then((patch) => {
        this.lastPatch = patch;
      })
      .catch(() => {
        // Bedrock is best-effort — do not block the UI
      });

    return this.buildCityLayout(this.lastFault, null);
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

  // ─── Surgical mutation ────────────────────────────────────────────────────

  async applyMutation(request: MutationRequest): Promise<MutationResult> {
    this.lastMutation = await this.engine.applySurgicalMutation(request);
    return this.lastMutation;
  }

  async rollbackLastMutation(): Promise<void> {
    if (this.lastMutation == null) {
      throw new AdapterError("rollbackLastMutation: no mutation to roll back.");
    }
    await this.engine.rollbackMutation(this.lastMutation.rollbackRecord);
    this.lastMutation = null;
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

  private buildBedrockRequest(): BedrockPatchRequest {
    const fault = this.lastFault!;
    const graph = this.currentGraph!;
    const targetFn = graph.functions.find((f) => f.id === fault.targetFunctionId);
    return {
      faultResult: fault,
      topologyGraph: graph,
      targetFunctionSource: `// Source unavailable at adapter layer — provide via UI upload`,
    };
  }

  private requireGraph(): void {
    if (this.currentGraph == null) {
      throw new AdapterError("No repository loaded. Call loadRepository() first.");
    }
  }
}

export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterError";
  }
}
