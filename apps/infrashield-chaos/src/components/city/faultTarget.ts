import type { CityNode } from "../../adapter";

/** Id of the node with the highest centrality; ties go to the first in array order, null when empty. */
export function highestCentralityId(nodes: readonly CityNode[]): string | null {
  let best: CityNode | null = null;
  for (const node of nodes) {
    if (best === null || node.centralityScore > best.centralityScore) {
      best = node;
    }
  }
  return best === null ? null : best.id;
}
