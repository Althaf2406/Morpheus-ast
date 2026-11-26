import { useEffect, useRef } from "react";
import type { DungeonLayout, NecroCompilerAdapter } from "../adapter.ts";
import { DYING_SECONDS } from "../entities/entityTransition.ts";
import type { PendingSpell } from "../spells/spellState.ts";

export function useLayoutRefresh(
  adapter: NecroCompilerAdapter,
  setLayout: (layout: DungeonLayout) => void,
  pending: PendingSpell | null,
  error: string | null
): void {
  const previousKind = useRef<PendingSpell["kind"] | null>(null);

  useEffect(() => {
    const finished = pending === null ? previousKind.current : null;
    previousKind.current = pending?.kind ?? null;
    if (finished === null || error !== null) return;
    const refresh = (): void => setLayout(adapter.buildDungeonLayout());
    if (finished === "UNDO") {
      refresh();
      return;
    }
    const timer = window.setTimeout(refresh, DYING_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [adapter, setLayout, pending, error]);
}
