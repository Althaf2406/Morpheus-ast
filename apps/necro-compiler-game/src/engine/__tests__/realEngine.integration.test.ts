/**
 * Integration test: real engine behind the real adapter, no mocks.
 *
 * Evidence for TASK-NC-12: casting a spell edits the real source of the
 * pre-loaded sample repository, and undo restores it byte for byte.
 * Everything runs in memory: no network, no AWS, no disk.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**
 */
import { describe, expect, it } from "vitest";
import { createNecroAdapter } from "../../adapter.ts";
import type { DungeonEntity, DungeonLayout, DungeonRoom, NecroCompilerAdapter } from "../../adapter.ts";

// --- Helpers ---
type MutationRequest = Parameters<NecroCompilerAdapter["castSpell"]>[0];
const ZOMBIE_PREFIX = "Unused variable: ";

function findZombie(
  rooms: readonly DungeonRoom[]
): { room: DungeonRoom; entity: DungeonEntity } | undefined {
  for (const room of rooms) {
    const entity = room.entities.find((e) => e.type === "ZOMBIE_VARIABLE" && e.title.startsWith(ZOMBIE_PREFIX));
    if (entity !== undefined) return { room, entity };
  }
  return undefined;
}

// --- Cast and undo on the real engine ---
describe("real engine: cast then undo on the sample repository", () => {
  it("changes the source on cast and restores it byte for byte on undo", async () => {
    const adapter = createNecroAdapter();
    const layout = await adapter.loadSampleRepository();

    const zombie = findZombie(layout.rooms);
    expect(zombie).toBeDefined();
    const { room, entity } = zombie!;
    const variableName = entity.title.slice(ZOMBIE_PREFIX.length);

    const original = adapter.getSourceText(room.filePath);
    expect(original).toBeDefined();
    const startIndex = original!.indexOf(variableName);
    expect(startIndex).toBeGreaterThanOrEqual(0);

    // This test builds its own request from the entity's range, independent of any planned suggestedSpell.
    const request: MutationRequest = {
      splices: [
        {
          filePath: room.filePath,
          startIndex,
          endIndex: startIndex + variableName.length,
          replacement: `${variableName}Purified`,
          description: `Rename ${variableName}`,
        },
      ],
    };

    const result = await adapter.castSpell(request);
    const mutated = adapter.getSourceText(room.filePath);
    expect(result.splicesApplied).toBe(1);
    expect(mutated).not.toBe(original);
    expect(mutated).toBe(result.mutatedSource);

    await adapter.rollbackLastSpell();
    expect(adapter.getSourceText(room.filePath)).toBe(original);
  });
});

// --- Real planned spells: cast the entity's own suggestedSpell, then undo ---
const UNCAUGHT_PREFIX = "Uncaught exception path in: ";

/** Entity identity that survives re-analysis (entity ids are renumbered by each scan). */
const entityKey = (room: DungeonRoom, entity: DungeonEntity): string =>
  `${room.filePath}::${room.functionName}::${entity.title}`;

function countEntities(layout: DungeonLayout, key: string): number {
  return layout.rooms.reduce((sum, room) => sum + room.entities.filter((e) => entityKey(room, e) === key).length, 0);
}

function findCastable(
  layout: DungeonLayout,
  titlePrefix: string
): { room: DungeonRoom; entity: DungeonEntity; spell: MutationRequest } | undefined {
  for (const room of layout.rooms) {
    for (const entity of room.entities) {
      if (entity.title.startsWith(titlePrefix) && entity.suggestedSpell !== null) {
        return { room, entity, spell: entity.suggestedSpell };
      }
    }
  }
  return undefined;
}

async function castAndUndo(titlePrefix: string): Promise<{ original: string; cast: string }> {
  const adapter = createNecroAdapter();
  const layout = await adapter.loadSampleRepository();

  const target = findCastable(layout, titlePrefix);
  expect(target).toBeDefined();
  const { room, entity, spell } = target!;
  const key = entityKey(room, entity);
  const original = adapter.getSourceText(room.filePath)!;
  const before = countEntities(layout, key);
  expect(before).toBe(1);

  await adapter.castSpell(spell);
  const cast = adapter.getSourceText(room.filePath)!;
  expect(cast).not.toBe(original);
  expect(countEntities(adapter.buildDungeonLayout(), key)).toBe(0);

  await adapter.rollbackLastSpell();
  expect(adapter.getSourceText(room.filePath)).toBe(original);
  expect(countEntities(adapter.buildDungeonLayout(), key)).toBe(before);
  return { original, cast };
}

describe("real engine: planned spells (suggestedSpell) cast and undo", () => {
  it("UNUSED_VARIABLE: the zombie is gone after cast and back after undo", async () => {
    await castAndUndo(ZOMBIE_PREFIX);
  });

  it("UNCAUGHT_EXCEPTION: the demon is gone after cast and back after undo, with a cause and no return", async () => {
    const { original, cast } = await castAndUndo(UNCAUGHT_PREFIX);
    expect(cast).toMatch(/\{ cause: \w+ \}/);

    // The wrapper's catch clause contains only the throw: no return was added.
    const wrapperCatches = [...cast.matchAll(/\n([ \t]*)\} catch \((\w+)\) \{\n\1(?:  |    |\t)throw new Error\([^\n]*\{ cause: \2 \}\);\n\1\}/g)];
    expect(wrapperCatches).toHaveLength(1);
    expect(original).not.toMatch(/\{ cause: /);
  });
});
