import * as THREE from "three";
import type { InstanceSpot } from "./monsterPicker.ts";

export interface MonsterGlow {
  show(spot: InstanceSpot): void;
  hide(): void;
  /** Gentle pulse; not called when motion is reduced. */
  pulse(time: number): void;
  dispose(): void;
}

// --- Constants ---
/** Halo radius relative to the monster's own radius. */
const HALO_SCALE = 1.5;

/** A soft additive halo (back-faced sphere) that outlines one monster instance. */
export function createMonsterGlow(scene: THREE.Scene, color: string, opacity: number): MonsterGlow {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const material = new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = 10;
  scene.add(mesh);
  return {
    show(spot) {
      mesh.position.copy(spot.position);
      mesh.scale.setScalar(spot.radius * HALO_SCALE);
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
    pulse(time) {
      material.opacity = opacity * (0.75 + 0.25 * Math.sin(time * 3));
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
