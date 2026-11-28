import type { DungeonLayout } from "../../adapter";

export const CLEAN_MESSAGE = "No monsters found, your code is clean";
export const NO_EDGES_MESSAGE = "No function calls were found, so the rooms have no corridors.";

interface Props {
  readonly layout: DungeonLayout;
}

/** Plain messages shown instead of an empty dungeon. */
export function LayoutNotices({ layout }: Props) {
  const clean = layout.totalEntities === 0;
  const noEdges = layout.corridors.length === 0;
  if (!clean && !noEdges) return null;
  return (
    <div className="hud-panel hud-notices" role="status">
      {clean && <p className="hud-empty">{CLEAN_MESSAGE}</p>}
      {noEdges && <p className="hud-empty">{NO_EDGES_MESSAGE}</p>}
    </div>
  );
}
