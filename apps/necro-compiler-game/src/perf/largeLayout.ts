import type { DungeonCorridor, DungeonEntity, DungeonLayout, DungeonRoom, EntityType, RoomSize } from "../adapter.ts";

// --- Constants ---
export const LARGE_ROOM_COUNT = 300;
const BOSS_STRIDE = 7;
const ENTITY_STRIDE = 2;
const SEVERITIES: readonly DungeonEntity["severity"][] = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
const REGULAR_TYPES: readonly EntityType[] = ["POLTERGEIST_DEMON", "ZOMBIE_VARIABLE", "SHADOW_LINT_GHOST"];
const NON_BOSS_SIZES: readonly RoomSize[] = ["SMALL", "MEDIUM", "LARGE"];

// --- Id helpers: zero-padded so code-unit order equals numeric order ---
const pad = (n: number): string => String(n).padStart(4, "0");
const roomId = (index: number): string => `room-${pad(index + 1)}`;

// --- Entity and room builders ---
function buildEntity(index: number, isBoss: boolean): DungeonEntity {
  return {
    entityId: `entity-${pad(index + 1)}`,
    findingId: `finding-${pad(index + 1)}`,
    type: isBoss ? "POLTERGEIST_DEMON_BOSS" : REGULAR_TYPES[index % REGULAR_TYPES.length],
    severity: SEVERITIES[index % SEVERITIES.length],
    title: `Generated smell ${index + 1}`,
    description: "Generated for performance fixtures.",
    suggestedSpell: null,
  };
}

function buildRoom(index: number, count: number): DungeonRoom {
  const isBoss = index % BOSS_STRIDE === 0;
  const size: RoomSize = isBoss ? "BOSS" : NON_BOSS_SIZES[index % NON_BOSS_SIZES.length];
  const hasEntity = isBoss || index % ENTITY_STRIDE === 0;
  const corridorIds = index + 1 < count ? [`cor-${pad(index + 1)}`] : [];
  return {
    id: roomId(index),
    functionName: `generatedFunction${index + 1}`,
    filePath: `src/generated/file${index + 1}.ts`,
    size,
    cyclomaticComplexity: isBoss ? 16 : 2 + (index % 12),
    isCircularDep: false,
    corridorIds,
    entities: hasEntity ? [buildEntity(index, isBoss)] : [],
  };
}

// --- Layout generator: room 0 is always a Boss_Room, so every layout has at least one ---
export function generateLayout(roomCount: number): DungeonLayout {
  const count = Math.max(1, Math.floor(roomCount));
  const rooms = Array.from({ length: count }, (_, index) => buildRoom(index, count));
  const corridors: readonly DungeonCorridor[] = rooms.slice(0, -1).map((room, index) => ({
    id: `cor-${pad(index + 1)}`,
    fromRoomId: room.id,
    toRoomId: roomId(index + 1),
    isInfiniteLoopCurse: false,
  }));
  return {
    rooms,
    corridors,
    totalEntities: rooms.reduce((total, room) => total + room.entities.length, 0),
    bossRoomIds: rooms.filter((room) => room.size === "BOSS").map((room) => room.id),
  };
}

export const largeLayout: DungeonLayout = generateLayout(LARGE_ROOM_COUNT);
