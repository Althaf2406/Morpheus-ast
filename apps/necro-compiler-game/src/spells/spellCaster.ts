import type { NecroCompilerAdapter } from "../adapter.ts";

// --- Types derived from the adapter, so the UI never imports core types ---
export type SpellRequest = Parameters<NecroCompilerAdapter["castSpell"]>[0];
export type SpellResult = Awaited<ReturnType<NecroCompilerAdapter["castSpell"]>>;

/** The part of the adapter the spell UI needs. NecroCompilerAdapter satisfies it structurally. */
export interface SpellCaster {
  castSpell(request: SpellRequest): Promise<SpellResult>;
  rollbackLastSpell(): Promise<void>;
}
