import type { Object3D } from "three";
import { createFaultObjects } from "./faultObjects.ts";
import { createFaultTick } from "./faultTick.ts";
import type { BuildParams, FaultAnimationHandle } from "./faultTypes.ts";

export { CASCADE_STAGGER_S, COLOR_AFFECTED, COLOR_FAULTED, COLOR_HEALTHY } from "./faultTypes.ts";
export type { BuildParams, FaultAnimationHandle } from "./faultTypes.ts";

// --- Constants ---

export const MAX_CASCADE_TICKS = 12;

/** Wraps a callback so it forwards at most `cap` calls; later calls are dropped. */
export function capCascadeReveal(
  callback: (() => void) | undefined,
  cap: number = MAX_CASCADE_TICKS
): (() => void) | undefined {
  if (!callback) return undefined;
  let count = 0;
  return () => {
    count += 1;
    if (count <= cap) callback();
  };
}

/**
 * Pure factory: creates every Three.js object of the fault animation and returns a
 * tick plus a dispose handle. The tick is registered with the scene's single Render_Loop.
 */
export function buildFaultAnimation(params: BuildParams): FaultAnimationHandle {
  const { scene } = params;
  const created = createFaultObjects(params);
  const animateTick = createFaultTick({
    ...created,
    onCascadeReveal: capCascadeReveal(params.onCascadeReveal),
  });
  const addedObjects: Object3D[] = [...created.objects];

  const dispose = (): void => {
    created.objects.forEach((mesh) => {
      scene.remove(mesh);
      mesh.dispose();
    });
    created.geometries.forEach((geo) => geo.dispose());
    created.materials.forEach((mat) => mat.dispose());
    addedObjects.length = 0;
  };

  return {
    animateTick,
    dispose,
    revealedAffectedIds: () =>
      new Set(created.cascade.filter((c) => c.revealed).map((c) => c.nodeId)),
    addedObjects: () => addedObjects,
  };
}
