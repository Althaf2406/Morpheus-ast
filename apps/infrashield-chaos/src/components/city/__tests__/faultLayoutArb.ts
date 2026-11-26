import * as fc from "fast-check";
import * as THREE from "three";
import type { CityNode, CityEdge } from "../../../adapter.ts";
// --- Layout arbitraries ---


const cityNodeArb = (id: string, opts?: { isFaulted?: boolean; isAffected?: boolean }): fc.Arbitrary<CityNode> =>
  fc.record({
    id:              fc.constant(id),
    name:            fc.hexaString({ minLength: 1, maxLength: 8 }),
    filePath:        fc.constant(`src/${id}.ts`),
    complexity:      fc.integer({ min: 1, max: 15 }),
    isFaulted:       fc.constant(opts?.isFaulted ?? false),
    isAffected:      fc.constant(opts?.isAffected ?? false),
    centralityScore: fc.float({ min: 0, max: 1, noNaN: true }),
  });

/** Generates a layout with exactly one faulted node and 0–8 affected nodes. */
export const layoutArb = fc.nat({ max: 7 }).chain((affectedCount) => {
  const faultedId = "fn-fault";
  const affectedIds = Array.from({ length: affectedCount }, (_, i) => `fn-aff-${i}`);
  const extraIds    = Array.from({ length: 3 },              (_, i) => `fn-hlth-${i}`);

  const allIds = [faultedId, ...affectedIds, ...extraIds];

  const nodesArb = fc.tuple(
    cityNodeArb(faultedId, { isFaulted: true }),
    ...affectedIds.map((id) => cityNodeArb(id, { isAffected: true })),
    ...extraIds.map((id)    => cityNodeArb(id)),
  );

  return nodesArb.map((nodes) => {
    // Build positions map
    const positions = new Map<string, THREE.Vector3>();
    allIds.forEach((id, i) => {
      positions.set(id, new THREE.Vector3(i * 2, 0, 0));
    });

    // Build a few edges (some touching the faulted node)
    const edges: CityEdge[] = affectedIds.map((aId, i) => ({
      id:         `e-${i}`,
      sourceId:   faultedId,
      targetId:   aId,
      isCyclic:   false,
      isCascading: true,
    }));

    return { nodes: nodes as CityNode[], edges, positions };
  });
});

export function makeScene(): THREE.Scene {
  return new THREE.Scene();
}
