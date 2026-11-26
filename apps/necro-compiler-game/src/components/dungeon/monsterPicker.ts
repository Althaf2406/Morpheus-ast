import * as THREE from "three";
import type { MonsterBatch } from "./entityMeshes.ts";

export interface PickHit {
  readonly entityId: string;
  readonly clientX: number;
  readonly clientY: number;
}

/** World position and radius of one monster instance. */
export interface InstanceSpot {
  readonly position: THREE.Vector3;
  readonly radius: number;
}

export interface PickerOptions {
  readonly dom: HTMLCanvasElement;
  readonly camera: THREE.Camera;
  readonly batches: readonly MonsterBatch[];
  readonly isPickable: (entityId: string) => boolean;
  /** Called only when the hovered monster changes. */
  readonly onHover: (hit: PickHit | null) => void;
  /** A click on a monster selects it; a click on empty space passes null. */
  readonly onSelect: (entityId: string | null) => void;
}

// --- Constants ---
/** Pointer travel (px) above which a press counts as a camera drag, not a click. */
const DRAG_THRESHOLD = 5;

// --- Instance lookup ---
const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();

export function locateInstance(batches: readonly MonsterBatch[], entityId: string): InstanceSpot | null {
  for (const batch of batches) {
    const index = batch.ids.indexOf(entityId);
    if (index < 0) continue;
    const position = new THREE.Vector3();
    batch.mesh.getMatrixAt(index, scratchMatrix);
    scratchMatrix.decompose(position, scratchQuaternion, scratchScale);
    return { position, radius: Math.max(scratchScale.x, scratchScale.y) };
  }
  return null;
}

// --- Picker ---
export function createMonsterPicker(options: PickerOptions): { dispose(): void } {
  const { dom, camera, batches, isPickable, onHover, onSelect } = options;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = batches.map((batch) => batch.mesh);
  let hoveredId: string | null = null;
  let pressX = 0;
  let pressY = 0;

  const pick = (event: PointerEvent): string | null => {
    const rect = dom.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const id = batches.find((batch) => batch.mesh === hit.object)?.ids[hit.instanceId ?? -1];
      if (id !== undefined && isPickable(id)) return id;
    }
    return null;
  };

  const setHover = (id: string | null, event: PointerEvent | null) => {
    if (id === hoveredId) return;
    hoveredId = id;
    dom.style.cursor = id === null ? "" : "pointer";
    onHover(id === null || event === null ? null : { entityId: id, clientX: event.clientX, clientY: event.clientY });
  };

  const onMove = (event: PointerEvent) => {
    if (event.buttons === 0) setHover(pick(event), event);
  };
  const onLeave = () => setHover(null, null);
  const onDown = (event: PointerEvent) => {
    pressX = event.clientX;
    pressY = event.clientY;
  };
  const onUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > DRAG_THRESHOLD) return;
    onSelect(pick(event));
  };

  dom.addEventListener("pointermove", onMove);
  dom.addEventListener("pointerleave", onLeave);
  dom.addEventListener("pointerdown", onDown);
  dom.addEventListener("pointerup", onUp);
  return {
    dispose() {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerleave", onLeave);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.style.cursor = "";
    },
  };
}
