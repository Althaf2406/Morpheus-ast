import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { frameCamera } from "../../layout/frameCamera.ts";

export interface CameraGlide {
  /** Moves the view to look at `target`: smoothly, or at once when motion is reduced. */
  focus(target: THREE.Vector3): void;
  /** Returns the view to the whole-dungeon pose: smoothly, or at once when motion is reduced. */
  reset(): void;
  tick(time: number): void;
  dispose(): void;
}

// --- Constants ---
const GLIDE_SECONDS = 0.9;
/** Closest the glide brings the camera to a focused room. */
const FOCUS_DISTANCE = 16;

interface Glide {
  readonly fromPosition: THREE.Vector3;
  readonly toPosition: THREE.Vector3;
  readonly fromTarget: THREE.Vector3;
  readonly toTarget: THREE.Vector3;
  startedAt: number | null;
}

const easeInOutCubic = (s: number): number => (s < 0.5 ? 4 * s * s * s : 1 - Math.pow(-2 * s + 2, 3) / 2);

export function createCameraGlide(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  reducedMotion: boolean,
  positions: ReadonlyMap<string, THREE.Vector3>
): CameraGlide {
  let glide: Glide | null = null;
  const overview = frameCamera(positions);
  const cancel = () => {
    glide = null;
  };
  controls.addEventListener("start", cancel);

  const moveTo = (toPosition: THREE.Vector3, toTarget: THREE.Vector3) => {
    if (reducedMotion) {
      glide = null;
      camera.position.copy(toPosition);
      controls.target.copy(toTarget);
      controls.update();
      return;
    }
    glide = {
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget: controls.target.clone(),
      toTarget: toTarget.clone(),
      startedAt: null,
    };
  };

  return {
    focus(target) {
      const offset = camera.position.clone().sub(controls.target);
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, FOCUS_DISTANCE);
      moveTo(target.clone().add(offset.setLength(distance)), target);
    },
    reset() {
      moveTo(overview.position.clone(), overview.target);
    },
    tick(time) {
      if (glide === null) return;
      glide.startedAt ??= time;
      const s = THREE.MathUtils.clamp((time - glide.startedAt) / GLIDE_SECONDS, 0, 1);
      const eased = easeInOutCubic(s);
      camera.position.lerpVectors(glide.fromPosition, glide.toPosition, eased);
      controls.target.lerpVectors(glide.fromTarget, glide.toTarget, eased);
      if (s >= 1) glide = null;
    },
    dispose() {
      controls.removeEventListener("start", cancel);
      glide = null;
    },
  };
}
