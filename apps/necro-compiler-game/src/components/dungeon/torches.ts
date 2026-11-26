import * as THREE from "three";
import type { Extent } from "../../entities/entityPlacement.ts";
import { wallHeightFor } from "../../entities/scale.ts";
import type { Origin } from "./roomParts.ts";
import { allocateTorches, flickerFactor, torchCorners, type TorchSlot } from "./torchAllocation.ts";

// --- Types ---

export interface TorchRoom {
  readonly id: string;
  readonly origin: Origin;
  readonly extent: Extent;
}

export interface Torches {
  readonly flames: THREE.InstancedMesh;
  readonly lights: readonly THREE.PointLight[];
  /** Per-frame tick taking clock time in seconds; null under Reduced_Motion (base values written once). */
  readonly tick: ((time: number) => void) | null;
  dispose(): void;
}

interface PlacedTorch {
  readonly slot: TorchSlot;
  readonly position: Origin;
  readonly seed: number;
  readonly baseIntensity: number;
  readonly light: THREE.PointLight | null;
}

// --- Constants ---

const FLAME_COLOR = 0xff9a3c;
/** Instance colour scale above 1 so the flame passes the Bloom_Pass threshold. */
const FLAME_BLOOM_GAIN = 2.5;
/** Flame diameter as a fraction of the room width. */
const FLAME_RADIUS_FRACTION = 0.035;
/** Flames are taller than wide. */
const FLAME_STRETCH = 1.4;
/** With decay 2, intensity scales with the square of the wall height so the light pool keeps its look at any room size. */
const LIGHT_INTENSITY_PER_SQUARE_HEIGHT = 4;
/** Light reach as a fraction of the room width. */
const LIGHT_RANGE_FRACTION = 0.9;
const SEED_STEP = 0.618033988749895;

// --- Helpers ---

function placeTorches(rooms: readonly TorchRoom[], slots: readonly TorchSlot[]): PlacedTorch[] {
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const placed: PlacedTorch[] = [];
  slots.forEach((slot, index) => {
    const room = byId.get(slot.roomId);
    if (room == null) return;
    const position = torchCorners(room.origin, room.extent)[slot.corner];
    const wallHeight = wallHeightFor(room.extent);
    const baseIntensity = LIGHT_INTENSITY_PER_SQUARE_HEIGHT * wallHeight * wallHeight;
    const light = slot.lit ? createLight(position, baseIntensity, room.extent[0] * LIGHT_RANGE_FRACTION) : null;
    placed.push({ slot, position, seed: (index * SEED_STEP) % 1, baseIntensity, light });
  });
  return placed;
}

function createLight(position: Origin, intensity: number, range: number): THREE.PointLight {
  const light = new THREE.PointLight(FLAME_COLOR, intensity, range, 2);
  light.position.set(position.x, position.y, position.z);
  return light;
}

// --- Factory ---

/**
 * Builds one flame InstancedMesh for all torches plus one PointLight per lit slot.
 * Boss rooms are the ids present in `rooms`; non-boss rooms must not be passed.
 */
export function createTorches(scene: THREE.Scene, rooms: readonly TorchRoom[], reducedMotion: boolean): Torches {
  const placed = placeTorches(rooms, allocateTorches(rooms.map((room) => room.id)));
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const flames = new THREE.InstancedMesh(geometry, material, placed.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const baseColor = new THREE.Color(FLAME_COLOR).multiplyScalar(FLAME_BLOOM_GAIN);
  const radiusOf = new Map(rooms.map((room) => [room.id, room.extent[0] * FLAME_RADIUS_FRACTION]));

  const apply = (time: number) => {
    placed.forEach((torch, i) => {
      const factor = flickerFactor(time, torch.seed, reducedMotion);
      flames.setColorAt(i, color.copy(baseColor).multiplyScalar(factor));
      if (torch.light != null) torch.light.intensity = torch.baseIntensity * factor;
    });
    if (flames.instanceColor != null) flames.instanceColor.needsUpdate = true;
  };

  placed.forEach((torch, i) => {
    const radius = radiusOf.get(torch.slot.roomId) ?? 0;
    matrix.makeScale(radius, radius * FLAME_STRETCH, radius).setPosition(torch.position.x, torch.position.y, torch.position.z);
    flames.setMatrixAt(i, matrix);
    if (torch.light != null) scene.add(torch.light);
  });
  flames.instanceMatrix.needsUpdate = true;
  scene.add(flames);
  apply(0);

  return {
    flames,
    lights: placed.flatMap((torch) => (torch.light == null ? [] : [torch.light])),
    tick: reducedMotion ? null : apply,
    dispose() {
      placed.forEach((torch) => {
        if (torch.light != null) scene.remove(torch.light);
      });
      scene.remove(flames);
      flames.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
