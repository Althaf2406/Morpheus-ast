/**
 * Property 4 — Zombie ids and per-type entity counts are preserved by a cast/undo round trip.
 *
 * Real engine behind the real adapter, no mocks. Everything runs in memory:
 * no network, no AWS, no disk.
 *
 * **Validates: Requirements 9.1**
 */
import * as fc from "fast-check";
import { describe, it, expect } from "vitest";
import { createNecroAdapter } from "../../adapter.ts";
import type { DungeonLayout, DungeonRoom, NecroCompilerAdapter } from "../../adapter.ts";

// --- Helpers ---
type MutationRequest = Parameters<NecroCompilerAdapter["castSpell"]>[0];
const ZOMBIE_PREFIX = "Unused variable: ";
const ROUND_TRIP_TIMEOUT_MS = 120_000;

// Only zombie ids are compared here; finding-based ids (entity-<findingId>) are covered by the
// core engine's id-stability properties.
function zombieIds(layout: DungeonLayout): readonly string[] {
  return layout.rooms
    .flatMap((room) => room.entities.map((e) => e.entityId))
    .filter((id) => id.startsWith("zombie-"))
    .sort();
}

function countsByType(layout: DungeonLayout): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const room of layout.rooms) {
    for (const e of room.entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  return counts;
}

function zombieTargets(rooms: readonly DungeonRoom[]): readonly { room: DungeonRoom; variableName: string }[] {
  return rooms.flatMap((room) =>
    room.entities
      .filter((e) => e.type === "ZOMBIE_VARIABLE" && e.title.startsWith(ZOMBIE_PREFIX))
      .map((e) => ({ room, variableName: e.title.slice(ZOMBIE_PREFIX.length) }))
  );
}

// --- Property 4 ---
describe("Property 4: cast/undo round trip preserves zombie ids and counts", () => {
  it(
    "rebuilt layout after cast and undo has the same zombie ids and per-type counts",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.nat(), fc.stringMatching(/^[A-Za-z]{1,8}$/), async (pick, suffix) => {
          const adapter = createNecroAdapter();
          const before = await adapter.loadSampleRepository();
          const targets = zombieTargets(before.rooms);
          expect(targets.length).toBeGreaterThan(0);

          const { room, variableName } = targets[pick % targets.length]!;
          const source = adapter.getSourceText(room.filePath)!;
          const startIndex = source.indexOf(variableName);
          expect(startIndex).toBeGreaterThanOrEqual(0);

          const request: MutationRequest = {
            splices: [
              {
                filePath: room.filePath,
                startIndex,
                endIndex: startIndex + variableName.length,
                replacement: `${variableName}${suffix}`,
                description: `Rename ${variableName}`,
              },
            ],
          };

          await adapter.castSpell(request);
          adapter.buildDungeonLayout();
          await adapter.rollbackLastSpell();
          const after = adapter.buildDungeonLayout();

          expect(zombieIds(after)).toEqual(zombieIds(before));
          expect(countsByType(after)).toEqual(countsByType(before));
        }),
        { numRuns: 10 }
      );
    },
    ROUND_TRIP_TIMEOUT_MS
  );
});
