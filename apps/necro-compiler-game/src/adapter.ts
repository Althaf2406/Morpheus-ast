/**
 * apps/necro-compiler-game/src/adapter.ts
 *
 * NECRO-COMPILER — Core Engine Adapter (Person A stub)
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
  FunctionNode,
  FaultInjectionResult,
  SecurityScanResult,
  FindingSeverity,
  FindingCategory,
  MutationRequest,
  MutationResult,
  RollbackRecord,
  BedrockPatchSuggestion,
  BedrockPatchRequest,
  ParseRequest,
} from "../../../packages/morpheus-ast-core/src/contracts.js";

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
}

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

  constructor(engine: MorpheusASTEngine) {
    this.engine = engine;
  }

  // ─── Repository loading ──────────────────────────────────────────────────

  async loadRepository(filePaths: readonly string[]): Promise<DungeonLayout> {
    const request: ParseRequest = { filePaths, includeSourceText: true };
    const parseResult = await this.engine.parseSourceFiles(request);

    this.currentGraph = await this.engine.buildTopologyGraph(parseResult.files);
    this.currentFindings = [
      ...(await this.engine.runSecurityScan(parseResult.files)),
    ];

    return this.buildDungeonLayout();
  }

  // ─── Spell casting (surgical mutation) ───────────────────────────────────

  async castSpell(request: MutationRequest): Promise<MutationResult> {
    this.lastMutation = await this.engine.applySurgicalMutation(request);
    this.lastRollback = false;
    // After mutation, rebuild the dungeon to reflect the cleaner code
    return this.lastMutation;
  }

  async rollbackLastSpell(): Promise<void> {
    if (this.lastMutation == null) {
      throw new NecroAdapterError("rollbackLastSpell: no spell to undo.");
    }
    await this.engine.rollbackMutation(this.lastMutation.rollbackRecord);
    this.lastRollback = true;
    this.lastMutation = null;
  }

  async rollbackRecord(record: RollbackRecord): Promise<void> {
    await this.engine.rollbackMutation(record);
  }

  // ─── AI spell advisor ────────────────────────────────────────────────────

  async getSpellHint(entityId: string, layout: DungeonLayout): Promise<BedrockPatchSuggestion> {
    this.requireGraph();

    const entity = this.findEntity(entityId, layout);
    if (entity == null) {
      throw new NecroAdapterError(`Entity "${entityId}" not found in dungeon layout.`);
    }

    const targetFn = this.currentGraph!.functions.find(
      (f) => layout.rooms.some((r) => r.id === entity.findingId && r.functionName === f.name)
    ) ?? this.currentGraph!.functions[0];

    if (targetFn == null) {
      throw new NecroAdapterError("No function found for AI spell hint.");
    }

    // Build a lightweight fault result for Bedrock context
    const fakeFault = await this.engine.injectFault(
      { targetFunctionId: targetFn.id, faultType: "UNCAUGHT_EXCEPTION" },
      this.currentGraph!
    );

    const patchRequest: BedrockPatchRequest = {
      faultResult: fakeFault,
      topologyGraph: this.currentGraph!,
      targetFunctionSource: `// Source available via Live Engine Inspector`,
    };

    this.lastAISuggestion = await this.engine.generateBedrockPatch(patchRequest);
    return this.lastAISuggestion;
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

    for (const finding of findings) {
      entities.push({
        entityId: `entity-${finding.findingId}`,
        findingId: finding.findingId,
        type: this.findingToEntityType(finding.severity, finding.category),
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        suggestedSpell: null, // Populated asynchronously via getSpellHint()
      });
    }

    // Unused variables become zombie entities even without a formal finding
    for (const varName of fn.unusedVariables) {
      entities.push({
        entityId: `zombie-${fn.id}-${varName}`,
        findingId: fn.id,
        type: "ZOMBIE_VARIABLE",
        severity: "LOW",
        title: `Unused variable: ${varName}`,
        description: `Variable "${varName}" is declared but never used.`,
        suggestedSpell: null,
      });
    }

    return entities;
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

  private findEntity(
    entityId: string,
    layout: DungeonLayout
  ): DungeonEntity | null {
    for (const room of layout.rooms) {
      for (const entity of room.entities) {
        if (entity.entityId === entityId) return entity;
      }
    }
    return null;
  }

  private requireGraph(): void {
    if (this.currentGraph == null) {
      throw new NecroAdapterError("No repository loaded. Call loadRepository() first.");
    }
  }
}

export class NecroAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NecroAdapterError";
  }
}
