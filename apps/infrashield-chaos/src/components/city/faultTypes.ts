import * as THREE from "three";
import type { CityNode, CityEdge } from "../../adapter.ts";

// --- Constants ---

export const COLOR_FAULTED  = new THREE.Color("#ff2222");
export const COLOR_AFFECTED = new THREE.Color("#ffaa00");
export const COLOR_HEALTHY  = new THREE.Color("#00e5ff");

export const CASCADE_STAGGER_S = 0.15; // seconds between amber reveal steps
export const COLLAPSE_DURATION = 1.2;  // seconds
export const FADE_DURATION     = 0.6;  // seconds

// --- Animated item types ---

export interface CollapseItem {
  mesh: THREE.InstancedMesh;
  x: number;
  z: number;
  baseHeight: number;
  startTime: number;
  settled: boolean;
}

export interface CascadeItem {
  mesh: THREE.InstancedMesh;
  nodeId: string;
  revealTime: number;
  revealed: boolean;
}

export interface FadeItem {
  mesh: THREE.InstancedMesh;
  startTime: number;
  done: boolean;
}

// --- Public handle types ---

export interface FaultAnimationHandle {
  animateTick: (elapsedTime: number) => void;
  dispose: () => void;
  /** Exposed for testing: returns current revealed set of nodeIds */
  revealedAffectedIds: () => ReadonlySet<string>;
  /** Exposed for testing: returns all scene objects added by this handle */
  addedObjects: () => readonly THREE.Object3D[];
}

export interface BuildParams {
  nodes: readonly CityNode[];
  edges: readonly CityEdge[];
  positions: Map<string, THREE.Vector3>;
  scene: THREE.Scene;
  reducedMotion: boolean;
}
