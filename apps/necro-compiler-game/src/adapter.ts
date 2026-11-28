/**
 * apps/necro-compiler-game/src/adapter.ts
 *
 * NECRO-COMPILER — Core Engine Adapter (Person A stub)
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
  SecurityScanResult,
  FindingSeverity,
  FindingCategory,
  MutationRequest,
  DiffHunk,
  DiffLine,
  MutationDiff,
  MutationResult,
  RollbackRecord,
  BedrockPatchSuggestion,
  BedrockPatchRequest,
  ParseRequest,
  ExternalScanReport,
  CandidateFile,
  LoadResult,
  LoadSummary,
  SkippedFile,
  RepositoryRef,
} from "../../../packages/morpheus-ast-core/src/contracts.js";
import { createEngine } from "../../../packages/morpheus-ast-core/src/index.js";
import {
  NO_FILES_MESSAGE,
  NO_FUNCTIONS_MESSAGE,
  adjustedSummary,
  excludeParseErrors,
  type LoadOutcome,
} from "./engine/loadFlow.ts";

export type { DiffHunk, DiffLine, MutationDiff, LoadOutcome, CandidateFile, LoadSummary, SkippedFile, RepositoryRef };

// ─────────────────────────────────────────────────────────────────────────────
// UI-facing data shapes (domain-specific names live HERE, not in core)
// ─────────────────────────────────────────────────────────────────────────────

/** Room size category derived from Cyclomatic Complexity. */
export type RoomSize = "SMALL" | "MEDIUM" | "LARGE" | "BOSS";

/** Type of enemy entity spawned from a security finding. */
export type EntityType =
  | "POLTERGEIST_DEMON_BOSS"
  | "POLTERGEIST_DEMON"
  | "ZOMBIE_VARIABLE"
  | "SHADOW_LINT_GHOST";

/** A dungeon room representing a function node. */
export interface DungeonRoom {
  readonly id: string;
  readonly functionName: string;
  readonly filePath: string;
  readonly size: RoomSize;
  readonly cyclomaticComplexity: number;
  readonly isCircularDep: boolean;
  readonly entities: readonly DungeonEntity[];
  readonly corridorIds: readonly string[];
}

/** A monster/entity spawned from a security finding. */
export interface DungeonEntity {
  readonly entityId: string;
  readonly findingId: string;
  readonly type: EntityType;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly description: string;
  /** The pre-computed splice that destroys this entity when cast. */
  readonly suggestedSpell: MutationRequest | null;
}

/** A corridor between two dungeon rooms (represents a call edge). */
export interface DungeonCorridor {
  readonly id: string;
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly isInfiniteLoopCurse: boolean;
}

/** Full dungeon layout passed to Person B's Three.js renderer. */
export interface DungeonLayout {
  readonly rooms: readonly DungeonRoom[];
  readonly corridors: readonly DungeonCorridor[];
  readonly totalEntities: number;
  readonly bossRoomIds: readonly string[];
}

/** State snapshot for the Live Engine Inspector overlay. */
export interface DungeonTelemetry {
  readonly roomCount: number;
  readonly entityCount: number;
  readonly lastSpellCast: MutationResult | null;
  readonly lastSpellRollback: boolean;
  readonly activeAISuggestion: BedrockPatchSuggestion | null;
  /** Line diff of the most recent spell (kept after undo); null before the first cast. */
  readonly lastDiff: MutationDiff | null;
  /** Name of the function the most recent spell targeted, when it could be located. */
  readonly targetFunction: string | null;
  readonly fingerprints: SourceFingerprints;
  /** True when the text after undo has the same SHA-256 as before the cast; null until an undo. */
  readonly rollbackVerified: boolean | null;
}

/** SHA-256 hex of the edited file before the spell, after it, and after undo. */
export interface SourceFingerprints {
  readonly before: string | null;
  readonly afterMutation: string | null;
  readonly afterRollback: string | null;
}

const NO_FINGERPRINTS: SourceFingerprints = { before: null, afterMutation: null, afterRollback: null };

// ─────────────────────────────────────────────────────────────────────────────
// NecroCompilerAdapter
// ─────────────────────────────────────────────────────────────────────────────

export class NecroCompilerAdapter {
  private engine: MorpheusASTEngine;
  private currentGraph: TopologyGraph | null = null;
  private currentFindings: SecurityScanResult[] = [];
  private lastMutation: MutationResult | null = null;
  private lastRollback = false;
  private lastAISuggestion: BedrockPatchSuggestion | null = null;
  private lastDiff: MutationDiff | null = null;
  private targetFunction: string | null = null;
  private fingerprints: SourceFingerprints = NO_FINGERPRINTS;
  private loadedActive = false;
  /** Sources of an in-memory repository (e.g. the pre-loaded sample), keyed by file path. Empty for disk repos. */
  private readonly virtualSources = new Map<string, string>();
  /** Text of every analysed file (in memory or from disk), for the spell advisor. Refreshed on each analysis. */
  private readonly analyzedSources = new Map<string, string>();

  constructor(engine: MorpheusASTEngine) {
    this.engine = engine;
  }

  // ─── Repository loading ──────────────────────────────────────────────────

  async loadRepository(filePaths: readonly string[]): Promise<DungeonLayout> {
    this.virtualSources.clear();
    this.loadedActive = false;
    this.resetSession();
    await this.analyze({ filePaths, includeSourceText: true });
    return this.buildDungeonLayout();
  }

  /**
   * Loads the pre-loaded sample repository: no upload, login or file system needed.
   * Spells cast on it are applied in memory (see castSpell).
   */
  async loadSampleRepository(): Promise<DungeonLayout> {
    const sample = this.engine.getSampleRepository();
    this.virtualSources.clear();
    this.loadedActive = false;
    this.resetSession();
    for (const file of sample.files) {
      this.virtualSources.set(file.filePath, file.sourceText);
    }
    await this.reanalyzeVirtual();
    return this.buildDungeonLayout();
  }

  /** Replaces the active repository with the given files. Failure keeps the previous one. */
  async loadFromCandidates(candidates: readonly CandidateFile[]): Promise<LoadOutcome> {
    return this.activate(this.engine.loadCode(candidates));
  }

  /** Fetches a public GitHub repository (`owner/name` or URL) and makes it active. */
  async loadFromGitHub(refText: string, fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<LoadOutcome> {
    const fetched = await this.engine.fetchGitHubRepository(refText, fetchFn);
    return fetched.ok ? this.activate(fetched.result) : { ok: false, message: fetched.error.message };
  }

  /** Parses `owner/name` or a GitHub URL; null when the text is not a valid reference. */
  parseRepositoryRef(value: string): RepositoryRef | null {
    return this.engine.parseRepositoryRef(value);
  }

  /** Restores the sample repository and discards the loaded one. */
  backToSample(): Promise<DungeonLayout> {
    return this.loadSampleRepository();
  }

  isLoadedRepositoryActive(): boolean {
    return this.loadedActive;
  }

  private async activate(result: LoadResult): Promise<LoadOutcome> {
    if (result.files.length === 0) return { ok: false, message: NO_FILES_MESSAGE };
    const snapshot = this.snapshot();
    try {
      const parsed = await this.engine.parseSourceFiles({ filePaths: [], virtualFiles: result.files, includeSourceText: true });
      const { good, parseErrors } = excludeParseErrors(result.files, parsed.files);
      this.virtualSources.clear();
      for (const file of good) this.virtualSources.set(file.filePath, file.sourceText);
      await this.reanalyzeVirtual();
      if (this.currentGraph === null || this.currentGraph.functions.length === 0) {
        this.restore(snapshot);
        return { ok: false, message: NO_FUNCTIONS_MESSAGE };
      }
      this.resetSession();
      this.loadedActive = true;
      const skipped = [...result.skipped, ...parseErrors];
      const layout = this.buildDungeonLayout();
      return {
        ok: true,
        layout,
        summary: adjustedSummary(good, skipped),
        skipped,
        filesAnalyzed: good.length,
        findingsCount: layout.totalEntities,
      };
    } catch (error) {
      this.restore(snapshot);
      return { ok: false, message: error instanceof Error ? error.message : "The code could not be analysed." };
    }
  }

  private snapshot() {
    return {
      sources: new Map(this.virtualSources),
      analyzed: new Map(this.analyzedSources),
      graph: this.currentGraph,
      findings: this.currentFindings,
      loaded: this.loadedActive,
    };
  }

  private restore(s: ReturnType<NecroCompilerAdapter["snapshot"]>): void {
    this.virtualSources.clear();
    s.sources.forEach((text, path) => this.virtualSources.set(path, text));
    this.analyzedSources.clear();
    s.analyzed.forEach((text, path) => this.analyzedSources.set(path, text));
    this.currentGraph = s.graph;
    this.currentFindings = s.findings;
    this.loadedActive = s.loaded;
  }

  /** Clears spell history, advisor suggestion and inspector state on every repository switch. */
  private resetSession(): void {
    this.lastMutation = null;
    this.lastRollback = false;
    this.lastAISuggestion = null;
    this.lastDiff = null;
    this.targetFunction = null;
    this.fingerprints = NO_FINGERPRINTS;
  }

  /** Current text of an in-memory file (for diffs in the Live Engine Inspector), or undefined. */
  getSourceText(filePath: string): string | undefined {
    return this.virtualSources.get(filePath);
  }

  // ─── Spell casting (surgical mutation) ───────────────────────────

  /**
   * Casts a spell. When every splice targets a file held in memory (the pre-loaded
   * sample), the mutation is applied in memory and the dungeon is re-analysed so
   * buildDungeonLayout() reflects it. Otherwise the splices are applied to files on disk.
   */
  async castSpell(request: MutationRequest): Promise<MutationResult> {
    const inMemory = request.splices.filter((s) => this.virtualSources.has(s.filePath)).length;
    if (inMemory > 0 && inMemory < request.splices.length) {
      throw new NecroAdapterError("castSpell: one spell cannot mix in-memory and on-disk files.");
    }

    // Located before the cast: re-analysis replaces the graph.
    const target = this.functionNameAt(request);
    const mutation =
      inMemory > 0
        ? await this.castSpellInMemory(request)
        : await this.engine.applySurgicalMutation(request);
    await this.recordInspection(mutation, target);
    this.lastMutation = mutation;
    this.lastRollback = false;
    return mutation;
  }

  async rollbackLastSpell(): Promise<void> {
    if (this.lastMutation == null) {
      throw new NecroAdapterError("rollbackLastSpell: no spell to undo.");
    }
    const { rollbackRecord, filePath, mutatedSource } = this.lastMutation;
    await this.rollbackRecord(rollbackRecord);
    const restored =
      this.virtualSources.get(filePath) ?? this.engine.rollbackMutationText(mutatedSource, rollbackRecord);
    this.fingerprints = { ...this.fingerprints, afterRollback: await this.engine.fingerprintText(restored) };
    this.lastRollback = true;
    this.lastMutation = null;
  }

  /** Restores a file from its record: in memory for sample files, on disk otherwise. */
  async rollbackRecord(record: RollbackRecord): Promise<void> {
    const current = this.virtualSources.get(record.filePath);
    if (current === undefined) {
      await this.engine.rollbackMutation(record);
      return;
    }
    this.virtualSources.set(record.filePath, this.engine.rollbackMutationText(current, record));
    await this.reanalyzeVirtual();
  }

  // ─── AI spell advisor ────────────────────────────────────────────────────

  /**
   * Asks the AI advisor how to destroy an entity. The advisor sees the real source of the
   * entity's function. After a spell cast on a disk repository, call loadRepository again so
   * the text sent to the advisor is current.
   */
  async getSpellHint(entityId: string, layout: DungeonLayout): Promise<BedrockPatchSuggestion> {
    this.requireGraph();

    const room = layout.rooms.find((r) => r.entities.some((e) => e.entityId === entityId));
    if (room === undefined) {
      throw new NecroAdapterError(`Entity "${entityId}" not found in dungeon layout.`);
    }
    const fn = this.currentGraph!.functions.find((f) => f.id === room.id);
    const file = fn === undefined ? undefined : this.analyzedSources.get(fn.filePath);
    if (fn === undefined || file === undefined) {
      throw new NecroAdapterError(`No source available for the function in room "${room.id}".`);
    }

    // The advisor needs a fault to reason about; use the most common one for a monster.
    const fault = await this.engine.injectFault(
      { targetFunctionId: fn.id, faultType: "UNCAUGHT_EXCEPTION" },
      this.currentGraph!
    );

    const patchRequest: BedrockPatchRequest = {
      faultResult: fault,
      topologyGraph: this.currentGraph!,
      targetFunctionSource: file.slice(fn.range.startIndex, fn.range.endIndex),
    };

    this.lastAISuggestion = await this.engine.generateBedrockPatch(patchRequest);
    return this.lastAISuggestion;
  }

  // --- External scanner reports ------------------------------------------

  /** Adds normalised SonarQube, Snyk, AWS Security Analyzer and Aikido findings as new entities. */
  ingestExternalFindings(report: ExternalScanReport): DungeonLayout {
    this.requireGraph();
    this.currentFindings = [
      ...this.currentFindings,
      ...this.engine.ingestExternalFindings(report, this.currentGraph!),
    ];
    return this.buildDungeonLayout();
  }

  // ─── Live Engine Inspector telemetry ─────────────────────────────────────

  getTelemetry(): DungeonTelemetry {
    const layout = this.currentGraph != null ? this.buildDungeonLayout() : null;
    return {
      roomCount: layout?.rooms.length ?? 0,
      entityCount: layout?.totalEntities ?? 0,
      lastSpellCast: this.lastMutation,
      lastSpellRollback: this.lastRollback,
      activeAISuggestion: this.lastAISuggestion,
      lastDiff: this.lastDiff,
      targetFunction: this.targetFunction,
      fingerprints: this.fingerprints,
      rollbackVerified:
        this.fingerprints.afterRollback === null || this.fingerprints.before === null
          ? null
          : this.fingerprints.afterRollback === this.fingerprints.before,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dungeon layout builder (AST → Dungeon transform)
  // ─────────────────────────────────────────────────────────────────────────

  buildDungeonLayout(): DungeonLayout {
    this.requireGraph();
    const graph = this.currentGraph!;

    const findingsByFunction = this.groupFindingsByFunction();

    const rooms: DungeonRoom[] = graph.functions.map((fn) => {
      const entities = this.buildEntities(fn, findingsByFunction.get(fn.id) ?? []);
      const size = this.functionToRoomSize(fn);
      const corridorIds = graph.edges
        .filter((e) => e.callerId === fn.id)
        .map((e) => e.id);

      return {
        id: fn.id,
        functionName: fn.name,
        filePath: fn.filePath,
        size,
        cyclomaticComplexity: fn.cyclomaticComplexity,
        isCircularDep: fn.hasCircularDep,
        entities,
        corridorIds,
      };
    });

    const corridors: DungeonCorridor[] = graph.edges.map((e) => ({
      id: e.id,
      fromRoomId: e.callerId,
      toRoomId: e.calleeId,
      isInfiniteLoopCurse: e.isCyclic,
    }));

    const bossRoomIds = rooms
      .filter((r) => r.size === "BOSS")
      .map((r) => r.id);

    const totalEntities = rooms.reduce((sum, r) => sum + r.entities.length, 0);

    return { rooms, corridors, totalEntities, bossRoomIds };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private functionToRoomSize(fn: FunctionNode): RoomSize {
    if (fn.cyclomaticComplexity >= 15) return "BOSS";
    if (fn.cyclomaticComplexity >= 6) return "LARGE";
    if (fn.cyclomaticComplexity >= 3) return "MEDIUM";
    return "SMALL";
  }

  private buildEntities(
    fn: FunctionNode,
    findings: SecurityScanResult[]
  ): DungeonEntity[] {
    const entities: DungeonEntity[] = [];
    const covered = new Set<string>();

    for (const finding of findings) {
      if (finding.category === "UNUSED_VARIABLE") {
        const name = this.unusedVariableName(finding, fn);
        if (name !== null) covered.add(name);
      }
      entities.push({
        entityId: `entity-${finding.findingId}`,
        findingId: finding.findingId,
        type: this.findingToEntityType(finding.severity, finding.category),
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        suggestedSpell: this.planSpell(finding),
      });
    }

    // Unused variables without a matching finding become zombie entities
    for (const varName of fn.unusedVariables) {
      if (covered.has(varName)) continue;
      const title = `Unused variable: ${varName}`;
      const description = `Variable "${varName}" is declared but never used.`;
      const synthetic: SecurityScanResult = {
        findingId: `zombie-${fn.id}-${varName}`,
        severity: "LOW",
        category: "UNUSED_VARIABLE",
        title,
        description,
        filePath: fn.filePath,
        range: fn.range,
        functionId: fn.id,
        sourceScanner: "INTERNAL",
        cweId: null,
        cvssScore: null,
      };
      entities.push({
        entityId: `zombie-${fn.id}-${varName}`,
        findingId: fn.id,
        type: "ZOMBIE_VARIABLE",
        severity: "LOW",
        title,
        description,
        suggestedSpell: this.planSpell(synthetic),
      });
    }

    return entities;
  }

  /** Asks the core planner for the fix of a finding; null when no safe fix exists. */
  private planSpell(finding: SecurityScanResult): MutationRequest | null {
    const source = this.analyzedSources.get(finding.filePath);
    if (source === undefined) return null;
    return this.engine.planRemediation(finding, source, { errorCause: true });
  }

  /**
   * Variable name an UNUSED_VARIABLE finding refers to: the identifier text at its range,
   * or (engine findings span the whole function) the name carried in its title.
   */
  private unusedVariableName(finding: SecurityScanResult, fn: FunctionNode): string | null {
    const source = this.analyzedSources.get(finding.filePath);
    const atRange = source?.slice(finding.range.startIndex, finding.range.endIndex);
    if (atRange !== undefined && fn.unusedVariables.includes(atRange)) return atRange;
    const prefix = "Unused variable: ";
    if (finding.title.startsWith(prefix)) return finding.title.slice(prefix.length);
    return null;
  }

  private findingToEntityType(
    severity: FindingSeverity,
    category: FindingCategory
  ): EntityType {
    if (category === "UNUSED_VARIABLE") return "ZOMBIE_VARIABLE";
    if (severity === "CRITICAL") return "POLTERGEIST_DEMON_BOSS";
    if (severity === "HIGH" || category === "UNCAUGHT_EXCEPTION") return "POLTERGEIST_DEMON";
    if (severity === "MEDIUM") return "ZOMBIE_VARIABLE";
    return "SHADOW_LINT_GHOST";
  }

  private groupFindingsByFunction(): Map<string, SecurityScanResult[]> {
    const map = new Map<string, SecurityScanResult[]>();
    for (const finding of this.currentFindings) {
      if (finding.functionId == null) continue;
      const list = map.get(finding.functionId) ?? [];
      list.push(finding);
      map.set(finding.functionId, list);
    }
    return map;
  }

  /** Name of the function that contains the first splice of a spell, or null. */
  private functionNameAt(request: MutationRequest): string | null {
    const first = request.splices[0];
    if (first === undefined) return null;
    const fn = this.currentGraph?.functions.find(
      (f) => f.filePath === first.filePath && f.range.startIndex <= first.startIndex && first.startIndex < f.range.endIndex
    );
    return fn?.name ?? null;
  }

  /** Stores the diff and the before/after fingerprints of a spell, computed by the core. */
  private async recordInspection(mutation: MutationResult, target: string | null): Promise<void> {
    const { rollbackRecord, mutatedSource } = mutation;
    const original = this.engine.rollbackMutationText(mutatedSource, rollbackRecord);
    const [before, afterMutation] = await Promise.all([
      this.engine.fingerprintText(original),
      this.engine.fingerprintText(mutatedSource),
    ]);
    this.lastDiff = this.engine.computeMutationDiff(rollbackRecord, mutatedSource);
    this.targetFunction = target;
    this.fingerprints = { before, afterMutation, afterRollback: null };
  }

  /** Applies a single-file splice batch to an in-memory source and refreshes the analysis. */
  private async castSpellInMemory(request: MutationRequest): Promise<MutationResult> {
    const filePath = request.splices[0]!.filePath;
    if (request.splices.some((s) => s.filePath !== filePath)) {
      throw new NecroAdapterError("castSpell: one spell must target a single file.");
    }

    const startMs = Date.now();
    const source = this.virtualSources.get(filePath)!;
    // Throws on conflicts or invalid ranges before any state changes.
    const text = this.engine.applyMutationToText(source, request.splices);
    this.virtualSources.set(filePath, text.mutatedSource);
    await this.reanalyzeVirtual();

    return {
      mutationId: text.rollbackRecord.mutationId,
      filePath,
      splicesApplied: request.splices.length,
      mutatedSource: text.mutatedSource,
      rollbackRecord: text.rollbackRecord,
      durationMs: Date.now() - startMs,
    };
  }

  private async reanalyzeVirtual(): Promise<void> {
    const virtualFiles = [...this.virtualSources].map(([filePath, sourceText]) => ({ filePath, sourceText }));
    await this.analyze({ filePaths: [], virtualFiles, includeSourceText: true });
  }

  private async analyze(request: ParseRequest): Promise<void> {
    const parseResult = await this.engine.parseSourceFiles(request);
    this.currentGraph = await this.engine.buildTopologyGraph(parseResult.files);
    this.currentFindings = [...(await this.engine.runSecurityScan(parseResult.files))];

    this.analyzedSources.clear();
    for (const file of parseResult.files) {
      if (file.sourceText.length > 0) this.analyzedSources.set(file.filePath, file.sourceText);
    }
  }
  private requireGraph(): void {
    if (this.currentGraph == null) {
      throw new NecroAdapterError("No repository loaded. Call loadRepository() first.");
    }
  }
}

/** Composition root: builds the adapter on top of the real core engine. */
export function createNecroAdapter(): NecroCompilerAdapter {
  return new NecroCompilerAdapter(createEngine());
}

export class NecroAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NecroAdapterError";
  }
}
