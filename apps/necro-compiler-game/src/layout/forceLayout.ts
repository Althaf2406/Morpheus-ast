import type { DungeonRoom, DungeonCorridor, RoomSize } from "../adapter.ts";
import * as THREE from "three";

// --- Constants ---

const ITERATIONS       = 400;
const ATTRACTION_K     = 0.02;
const GRAVITY_K        = 0.004; // weak pull toward origin to prevent isolated rooms drifting far
const MAX_DISPLACEMENT = 3.0;

// Scaled ×1.6 to match ROOM_SCALE visual extents in DungeonRooms.tsx.
// Must stay consistent with the XZ half-extent of each box so the no-overlap
// PBT (P3) reflects the actual rendered footprint.
export const SIZE_RADIUS: Record<RoomSize, number> = {
  SMALL:  2.4,
  MEDIUM: 4.0,
  LARGE:  5.6,
  BOSS:   8.0,
};

const SIZE_Y: Record<RoomSize, number> = {
  SMALL:  0,
  MEDIUM: 0,
  LARGE:  0,
  BOSS:   2,
};

// --- Types ---

export interface ForceLayoutResult {
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
}

// --- Helpers ---

function initialPosition(index: number, total: number): THREE.Vector3 {
  const angle  = (index / Math.max(total, 1)) * Math.PI * 2;
  // Ring radius ~2.5× room count keeps initial positions compact.
  // Previously used 5.6× which spread 12 rooms to radius ~67, causing the
  // layout to settle far outside the target bounding radius of 25–45 units.
  const radius = Math.max(total, 1) * 2.5;
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    0,
    Math.sin(angle) * radius
  );
}

// --- Main export ---

export function computeForceLayout(
  rooms: readonly DungeonRoom[],
  corridors: readonly DungeonCorridor[]
): ForceLayoutResult {
  const n = rooms.length;

  if (n === 0) {
    return { positions: new Map() };
  }

  // --- Seed deterministic positions on XZ plane ---
  const positions = rooms.map((_, i) => initialPosition(i, n));

  // --- Build adjacency for spring attractions ---
  const idToIndex = new Map<string, number>(rooms.map((r, i) => [r.id, i]));

  // --- Iterate ---
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = Array.from({ length: n }, () => new THREE.Vector3(0, 0, 0));

    // Repulsion between all pairs — use size-aware minimum separation
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const delta = new THREE.Vector3().subVectors(positions[a], positions[b]);
        delta.y = 0;
        const dist    = Math.max(delta.length(), 0.01);
        const minSep  = SIZE_RADIUS[rooms[a].size] + SIZE_RADIUS[rooms[b].size];
        // Repulsion is strong when inside the exclusion zone, weaker outside
        const overlap = Math.max(minSep - dist, 0);
        const repK    = 120.0 + overlap * 60.0;
        const force   = repK / (dist * dist);
        const dir     = delta.clone().normalize();
        forces[a].addScaledVector(dir,  force);
        forces[b].addScaledVector(dir, -force);
      }
    }

    // Attraction along corridors
    for (const corridor of corridors) {
      const ia = idToIndex.get(corridor.fromRoomId);
      const ib = idToIndex.get(corridor.toRoomId);
      if (ia == null || ib == null) continue;

      const delta = new THREE.Vector3().subVectors(positions[ib], positions[ia]);
      delta.y = 0;
      forces[ia].addScaledVector(delta,  ATTRACTION_K);
      forces[ib].addScaledVector(delta, -ATTRACTION_K);
    }

    // Weak gravity toward origin — prevents disconnected rooms from drifting
    for (let i = 0; i < n; i++) {
      const toOrigin = positions[i].clone().negate();
      toOrigin.y = 0;
      forces[i].addScaledVector(toOrigin, GRAVITY_K);
    }

    // Apply forces with clamping
    for (let i = 0; i < n; i++) {
      const len = forces[i].length();
      if (len > MAX_DISPLACEMENT) {
        forces[i].multiplyScalar(MAX_DISPLACEMENT / len);
      }
      positions[i].add(forces[i]);
    }
  }

  // --- Hard-separation pass: push overlapping pairs apart ---
  for (let pass = 0; pass < 50; pass++) {
    let anyOverlap = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const delta  = new THREE.Vector3().subVectors(positions[a], positions[b]);
        delta.y      = 0;
        const dist   = delta.length();
        const minSep = SIZE_RADIUS[rooms[a].size] + SIZE_RADIUS[rooms[b].size];
        if (dist < minSep) {
          anyOverlap = true;
          const push = (minSep - dist) / 2 + 0.01;
          const dir  = dist < 0.0001
            ? new THREE.Vector3(1, 0, 0)
            : delta.clone().normalize();
          positions[a].addScaledVector(dir,  push);
          positions[b].addScaledVector(dir, -push);
        }
      }
    }
    if (!anyOverlap) break;
  }

  // --- Assign Y based on room size, build result map ---
  const result = new Map<string, THREE.Vector3>();
  rooms.forEach((room, i) => {
    const p = positions[i];
    result.set(room.id, new THREE.Vector3(p.x, SIZE_Y[room.size], p.z));
  });

  return { positions: result };
}
