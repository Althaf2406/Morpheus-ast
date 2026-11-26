import { useEffect } from "react";
import * as THREE from "three";
import type { DungeonCorridor, DungeonRoom } from "../../adapter.ts";

// --- Color constants ---
const COLOR_NORMAL: THREE.Color = new THREE.Color("#4a3728");
const COLOR_CURSE:  THREE.Color = new THREE.Color("#9b2cad");

// --- Props ---
interface Props {
  readonly corridors: readonly DungeonCorridor[];
  readonly rooms:     readonly DungeonRoom[];
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
  readonly scene:     THREE.Scene;
}

// --- Builder: adds one LineSegments object to the scene and returns a disposer (null when empty) ---
export function buildCorridorLines(
  corridors: readonly DungeonCorridor[],
  rooms: readonly DungeonRoom[],
  positions: ReadonlyMap<string, THREE.Vector3>,
  scene: THREE.Scene,
): (() => void) | null {
  if (corridors.length === 0) return null;

  const posArr = new Float32Array(corridors.length * 2 * 3);
  const colArr = new Float32Array(corridors.length * 2 * 3);

  corridors.forEach((corridor, i) => {
    const src = positions.get(corridor.fromRoomId);
    const tgt = positions.get(corridor.toRoomId);
    if (src == null || tgt == null) return;

    const srcRoom = rooms.find((r) => r.id === corridor.fromRoomId);
    const tgtRoom = rooms.find((r) => r.id === corridor.toRoomId);
    // Raise corridor endpoints to room mid-height
    const srcY = src.y + (srcRoom != null ? 0.5 : 0);
    const tgtY = tgt.y + (tgtRoom != null ? 0.5 : 0);

    const col  = corridor.isInfiniteLoopCurse ? COLOR_CURSE : COLOR_NORMAL;
    const base = i * 6;

    posArr[base + 0] = src.x; posArr[base + 1] = srcY; posArr[base + 2] = src.z;
    posArr[base + 3] = tgt.x; posArr[base + 4] = tgtY; posArr[base + 5] = tgt.z;

    colArr[base + 0] = col.r; colArr[base + 1] = col.g; colArr[base + 2] = col.b;
    colArr[base + 3] = col.r; colArr[base + 4] = col.g; colArr[base + 5] = col.b;
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  geo.setAttribute("color",    new THREE.BufferAttribute(colArr, 3));

  const mat   = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth:    1,
    transparent:  true,
    opacity:      0.8,
  });
  const lines = new THREE.LineSegments(geo, mat);
  scene.add(lines);

  return () => {
    scene.remove(lines);
    geo.dispose();
    mat.dispose();
  };
}

export function DungeonCorridors({ corridors, rooms, positions, scene }: Props) {
  useEffect(
    () => buildCorridorLines(corridors, rooms, positions, scene) ?? undefined,
    [corridors, rooms, positions, scene],
  );

  return null;
}
