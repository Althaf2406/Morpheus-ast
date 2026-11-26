import type { DungeonCorridor, DungeonEntity, DungeonLayout, DungeonRoom } from "../adapter.ts";

// --- Spells: every monster but the last has a spell; the last one shows the disabled state ---
const spell = (filePath: string): NonNullable<DungeonEntity["suggestedSpell"]> => ({
  splices: [{ filePath, startIndex: 0, endIndex: 0, replacement: "", description: "Refactor the flagged code" }],
});


// --- Rooms: 12 total, 2 boss rooms, mix of all sizes ---

const rooms: readonly DungeonRoom[] = [
  // Boss rooms (cyclomaticComplexity >= 15)
  {
    id: "room-001",
    functionName: "parseEntireRepository",
    filePath: "src/core/parser.ts",
    size: "BOSS",
    cyclomaticComplexity: 18,
    isCircularDep: true,
    corridorIds: ["cor-001", "cor-002"],
    entities: [
      {
        entityId: "entity-001",
        findingId: "finding-001",
        type: "POLTERGEIST_DEMON_BOSS",
        severity: "CRITICAL",
        title: "Uncaught exception in parser root",
        description: "Top-level parse errors propagate uncaught.",
        suggestedSpell: spell("src/core/parser.ts"),
      },
    ],
  },
  {
    id: "room-002",
    functionName: "resolveCircularImports",
    filePath: "src/core/resolver.ts",
    size: "BOSS",
    cyclomaticComplexity: 16,
    isCircularDep: true,
    corridorIds: ["cor-003", "cor-004"],
    entities: [
      {
        entityId: "entity-002",
        findingId: "finding-002",
        type: "POLTERGEIST_DEMON",
        severity: "HIGH",
        title: "Deep recursion without guard",
        description: "Circular import resolution can stack-overflow.",
        suggestedSpell: spell("src/core/resolver.ts"),
      },
    ],
  },
  // Large rooms
  {
    id: "room-003",
    functionName: "buildTopologyGraph",
    filePath: "src/topology/builder.ts",
    size: "LARGE",
    cyclomaticComplexity: 10,
    isCircularDep: false,
    corridorIds: ["cor-005"],
    entities: [
      {
        entityId: "entity-003",
        findingId: "finding-003",
        type: "ZOMBIE_VARIABLE",
        severity: "MEDIUM",
        title: "Unused variable: tempNodes",
        description: "Variable tempNodes is declared but never read.",
        suggestedSpell: spell("src/topology/builder.ts"),
      },
    ],
  },
  {
    id: "room-004",
    functionName: "computeBlastRadius",
    filePath: "src/blast/radius.ts",
    size: "LARGE",
    cyclomaticComplexity: 12,
    isCircularDep: false,
    corridorIds: ["cor-006", "cor-007"],
    entities: [],
  },
  // Medium rooms
  {
    id: "room-005",
    functionName: "applySurgicalMutation",
    filePath: "src/mutator/splice.ts",
    size: "MEDIUM",
    cyclomaticComplexity: 7,
    isCircularDep: false,
    corridorIds: ["cor-008"],
    entities: [
      {
        entityId: "entity-004",
        findingId: "finding-004",
        type: "SHADOW_LINT_GHOST",
        severity: "LOW",
        title: "Inconsistent return type",
        description: "Function returns different shapes in branches.",
        suggestedSpell: spell("src/mutator/splice.ts"),
      },
    ],
  },
  {
    id: "room-006",
    functionName: "rollbackMutation",
    filePath: "src/mutator/rollback.ts",
    size: "MEDIUM",
    cyclomaticComplexity: 8,
    isCircularDep: false,
    corridorIds: ["cor-009"],
    entities: [],
  },
  {
    id: "room-007",
    functionName: "generateBedrockPatch",
    filePath: "src/bedrock/advisor.ts",
    size: "MEDIUM",
    cyclomaticComplexity: 9,
    isCircularDep: false,
    corridorIds: ["cor-010"],
    entities: [
      {
        entityId: "entity-005",
        findingId: "finding-005",
        type: "POLTERGEIST_DEMON",
        severity: "HIGH",
        title: "API key in source",
        description: "Bedrock API key hardcoded in function body.",
        suggestedSpell: spell("src/bedrock/advisor.ts"),
      },
    ],
  },
  {
    id: "room-008",
    functionName: "runSecurityScan",
    filePath: "src/scanner/runner.ts",
    size: "MEDIUM",
    cyclomaticComplexity: 6,
    isCircularDep: false,
    corridorIds: ["cor-011"],
    entities: [],
  },
  // Small rooms
  {
    id: "room-009",
    functionName: "parseSourceFiles",
    filePath: "src/parser/entry.ts",
    size: "SMALL",
    cyclomaticComplexity: 2,
    isCircularDep: false,
    corridorIds: [],
    entities: [],
  },
  {
    id: "room-010",
    functionName: "emitFaultEvent",
    filePath: "src/events/emitter.ts",
    size: "SMALL",
    cyclomaticComplexity: 1,
    isCircularDep: false,
    corridorIds: [],
    entities: [
      {
        entityId: "entity-006",
        findingId: "finding-006",
        type: "ZOMBIE_VARIABLE",
        severity: "LOW",
        title: "Unused variable: eventId",
        description: "Variable eventId is never consumed.",
        suggestedSpell: null,
      },
    ],
  },
  {
    id: "room-011",
    functionName: "hashSourceText",
    filePath: "src/utils/hash.ts",
    size: "SMALL",
    cyclomaticComplexity: 2,
    isCircularDep: false,
    corridorIds: [],
    entities: [],
  },
  {
    id: "room-012",
    functionName: "formatDuration",
    filePath: "src/utils/format.ts",
    size: "SMALL",
    cyclomaticComplexity: 3,
    isCircularDep: false,
    corridorIds: [],
    entities: [],
  },
];

// --- Corridors connecting rooms ---

const corridors: readonly DungeonCorridor[] = [
  // Infinite loop curse: circular dep between boss rooms
  { id: "cor-001", fromRoomId: "room-001", toRoomId: "room-002", isInfiniteLoopCurse: true },
  { id: "cor-002", fromRoomId: "room-001", toRoomId: "room-003", isInfiniteLoopCurse: false },
  { id: "cor-003", fromRoomId: "room-002", toRoomId: "room-001", isInfiniteLoopCurse: true },
  { id: "cor-004", fromRoomId: "room-002", toRoomId: "room-004", isInfiniteLoopCurse: false },
  { id: "cor-005", fromRoomId: "room-003", toRoomId: "room-005", isInfiniteLoopCurse: false },
  { id: "cor-006", fromRoomId: "room-004", toRoomId: "room-006", isInfiniteLoopCurse: false },
  { id: "cor-007", fromRoomId: "room-004", toRoomId: "room-007", isInfiniteLoopCurse: false },
  { id: "cor-008", fromRoomId: "room-005", toRoomId: "room-009", isInfiniteLoopCurse: false },
  { id: "cor-009", fromRoomId: "room-006", toRoomId: "room-010", isInfiniteLoopCurse: false },
  { id: "cor-010", fromRoomId: "room-007", toRoomId: "room-011", isInfiniteLoopCurse: false },
  { id: "cor-011", fromRoomId: "room-008", toRoomId: "room-012", isInfiniteLoopCurse: false },
];

export const mockDungeonLayout: DungeonLayout = {
  rooms,
  corridors,
  totalEntities: 6,
  bossRoomIds: ["room-001", "room-002"],
};
