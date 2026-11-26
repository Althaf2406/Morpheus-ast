import type { Object3D } from "three";
import { createFaultObjects } from "./faultObjects.ts";
import { createFaultTick } from "./faultTick.ts";
import type { BuildParams, FaultAnimationHandle } from "./faultTypes.ts";

export { CASCADE_STAGGER_S, COLOR_AFFECTED, COLOR_FAULTED, COLOR_HEALTHY } from "./faultTypes.ts";
export type { BuildParams, FaultAnimationHandle } from "./faultTypes.ts";

/**
 * Pure factory: creates every Three.js object of the fault animation and returns a
 * tick plus a dispose handle. The tick is registered with the scene's single Render_Loop.
 */
export function buildFaultAnimation(params: BuildParams): FaultAnimationHandle {
  const { scene } = params;
  const created = createFaultObjects(params);
  const animateTick = createFaultTick(created);
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
