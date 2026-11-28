import * as THREE from "three";
import { setBoxPose } from "./instancePose.ts";
import {
  COLLAPSE_DURATION,
  COLOR_AFFECTED,
  FADE_DURATION,
  type CascadeItem,
  type CollapseItem,
  type FadeItem,
} from "./faultTypes.ts";

// --- Constants ---

const FADE_START_OPACITY  = 0.9;
const SETTLED_EMISSIVE    = 0.08;
const SETTLED_SPREAD      = 1.1;  // rubble is slightly wider than the building
const SETTLED_HEIGHT      = 0.05;
const SETTLED_TILT        = 0.25;

// --- Poses ---

/** Places a collapse instance at progress 0..1; 1 is the settled, flat rubble pose. */
export function applyCollapsePose(item: CollapseItem, progress: number): void {
  if (progress >= 1) {
    setBoxPose(
      item.mesh, 0,
      { x: item.x, y: SETTLED_HEIGHT / 2, z: item.z },
      { x: item.width * SETTLED_SPREAD, y: SETTLED_HEIGHT, z: item.width * SETTLED_SPREAD },
      SETTLED_TILT
    );
    item.settled = true;
    return;
  }
  const scaleY    = Math.max(item.baseHeight * (1 - progress * 0.95), SETTLED_HEIGHT);
  const footprint = item.width * (1 + progress * (SETTLED_SPREAD - 1));
  setBoxPose(
    item.mesh, 0,
    { x: item.x, y: scaleY / 2, z: item.z },
    { x: footprint, y: scaleY, z: footprint },
    progress * SETTLED_TILT
  );
}

// --- Tick ---

interface TickTargets {
  readonly collapse: readonly CollapseItem[];
  readonly cascade: readonly CascadeItem[];
  readonly fades: readonly FadeItem[];
  readonly onCascadeReveal?: () => void;
}

/** Builds the per-frame update; items already in their final state are skipped. */
export function createFaultTick({
  collapse,
  cascade,
  fades,
  onCascadeReveal,
}: TickTargets): (elapsed: number) => void {
  let startEpoch = -1;

  return (elapsed: number): void => {
    if (startEpoch < 0) startEpoch = elapsed;
    const localT = elapsed - startEpoch;

    collapse.forEach((item) => {
      if (item.settled) return;
      if (item.startTime < 0) item.startTime = elapsed;
      const progress = (elapsed - item.startTime) / COLLAPSE_DURATION;
      applyCollapsePose(item, progress);
      if (item.settled) {
        (item.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = SETTLED_EMISSIVE;
      }
    });

    cascade.forEach((item) => {
      if (item.revealed || localT < item.revealTime) return;
      const mat = item.mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(COLOR_AFFECTED);
      mat.emissive.set(COLOR_AFFECTED);
      item.revealed = true;
      onCascadeReveal?.();
    });

    fades.forEach((item) => {
      if (item.done) return;
      if (item.startTime < 0) item.startTime = elapsed;
      const progress = Math.min((elapsed - item.startTime) / FADE_DURATION, 1);
      (item.mesh.material as THREE.MeshBasicMaterial).opacity = FADE_START_OPACITY * (1 - progress);
      if (progress >= 1) {
        item.mesh.visible = false;
        item.done = true;
      }
    });
  };
}
