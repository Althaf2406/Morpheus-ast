import type { SpellCaster, SpellRequest, SpellResult } from "../spells/spellCaster.ts";

// --- Constants ---
const DEFAULT_DELAY_MS = 600;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stand-in for the adapter until the real one is wired in. Like the adapter, it
 * remembers only the last spell: undo works once, and fails when nothing was cast.
 */
export function createMockSpellCaster(delayMs: number = DEFAULT_DELAY_MS): SpellCaster {
  let lastSpell: SpellResult | null = null;
  let counter = 0;
  return {
    async castSpell(request: SpellRequest): Promise<SpellResult> {
      await wait(delayMs);
      counter += 1;
      const mutationId = `mock-mutation-${counter}`;
      const filePath = request.splices[0]?.filePath ?? "";
      lastSpell = {
        mutationId,
        filePath,
        splicesApplied: request.splices.length,
        mutatedSource: "",
        rollbackRecord: {
          mutationId,
          filePath,
          originalSegments: request.splices.map((s) => ({
            startIndex: s.startIndex,
            originalText: "",
            replacementLength: s.replacement.length,
          })),
          appliedAt: counter,
        },
        durationMs: delayMs,
      };
      return lastSpell;
    },
    async rollbackLastSpell(): Promise<void> {
      if (lastSpell === null) throw new Error("rollbackLastSpell: no spell to undo.");
      lastSpell = null;
    },
  };
}
