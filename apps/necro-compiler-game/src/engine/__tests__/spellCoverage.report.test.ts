/**
 * Spell coverage report for the sample repository, built with the real engine.
 * Prints, per entity type, how many entities carry a non-null spell, and which
 * catch form the UNCAUGHT_EXCEPTION spells use.
 *
 * Feature: deterministic-remediation
 * **Validates: Requirements 6.1, 10.5**
 */
import { describe, expect, it } from "vitest";
import { createNecroAdapter } from "../../adapter.ts";
import type { DungeonEntity, EntityType } from "../../adapter.ts";

// --- Helpers ---
const UNCAUGHT_PREFIX = "Uncaught exception path in: ";

interface Coverage {
  total: number;
  withSpell: number;
}

const replacementText = (entity: DungeonEntity): string =>
  entity.suggestedSpell === null ? "" : entity.suggestedSpell.splices.map((s) => s.replacement).join("");

// --- Report ---
describe("spell coverage report: sample repository", () => {
  it("counts spells per entity type and confirms the Cause_Form for uncaught exceptions", async () => {
    const adapter = createNecroAdapter();
    const layout = await adapter.loadSampleRepository();
    const entities = layout.rooms.flatMap((room) => room.entities);
    expect(entities.length).toBeGreaterThan(0);

    const perType = new Map<EntityType, Coverage>();
    for (const entity of entities) {
      const row = perType.get(entity.type) ?? { total: 0, withSpell: 0 };
      row.total += 1;
      if (entity.suggestedSpell !== null) row.withSpell += 1;
      perType.set(entity.type, row);
    }

    const uncaught = entities.filter((e) => e.title.startsWith(UNCAUGHT_PREFIX));
    const uncaughtWithSpell = uncaught.filter((e) => e.suggestedSpell !== null);
    const causeForm = uncaughtWithSpell.filter((e) => replacementText(e).includes("cause:"));
    const catchForm = uncaughtWithSpell.length === 0 ? "none (no uncaught-exception spells)" : "Cause_Form";

    const lines = [...perType.entries()].map(
      ([type, row]) => `${type.padEnd(26)} | ${String(row.withSpell).padStart(10)} | ${String(row.total).padStart(5)}`
    );
    const sum = (pick: (row: Coverage) => number): number => [...perType.values()].reduce((s, r) => s + pick(r), 0);
    console.log(
      [
        "Spell coverage (Sample_Repo)",
        `${"Entity type".padEnd(26)} | ${"With spell".padStart(10)} | ${"Total".padStart(5)}`,
        ...lines,
        `${"ALL".padEnd(26)} | ${String(sum((r) => r.withSpell)).padStart(10)} | ${String(sum((r) => r.total)).padStart(5)}`,
        `UNCAUGHT_EXCEPTION catch form in use: ${catchForm} (${causeForm.length}/${uncaughtWithSpell.length} spells)`,
      ].join("\n")
    );

    // Internal consistency.
    for (const row of perType.values()) {
      expect(row.withSpell).toBeGreaterThanOrEqual(0);
      expect(row.withSpell).toBeLessThanOrEqual(row.total);
    }
    expect(sum((r) => r.total)).toBe(entities.length);
    expect(sum((r) => r.withSpell)).toBe(entities.filter((e) => e.suggestedSpell !== null).length);

    // The adapter passes errorCause: true, so every uncaught-exception spell is the Cause_Form.
    expect(causeForm.length).toBe(uncaughtWithSpell.length);
  });
});
