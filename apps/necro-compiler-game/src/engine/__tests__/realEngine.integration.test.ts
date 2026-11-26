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
import type { DungeonEntity, DungeonRoom, NecroCompilerAdapter } from "../../adapter.ts";

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

    // suggestedSpell is null for every entity, so the request is built here from the entity's range.
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
