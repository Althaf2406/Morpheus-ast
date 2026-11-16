import { useEffect } from "react";
import * as THREE from "three";
import type { DungeonRoom, RoomSize } from "../../adapter.ts";

// --- Brightened gothic stone palette ---
// Scaled ×1.6 from original to match SIZE_RADIUS in forceLayout.ts.
export const ROOM_SCALE: Record<RoomSize, [number, number, number]> = {
  SMALL:  [1.9, 1.6, 1.9],
  MEDIUM: [2.9, 2.2, 2.9],
  LARGE:  [4.0, 3.2, 4.0],
  BOSS:   [6.4, 4.8, 6.4],
};

// --- Group definition ---

interface SizeGroup {
  readonly size:              RoomSize;
  readonly color:             number;  // hex
  readonly emissive:          number;  // hex
  readonly emissiveIntensity: number;
}

// setColorAt multiplies instance color by material.color, turning it near-black.
// We rely solely on material.color — do NOT call setColorAt anywhere here.
const SIZE_GROUPS: readonly SizeGroup[] = [
  { size: "SMALL",  color: 0x3a3a5c, emissive: 0x1a1a2e, emissiveIntensity: 0.15 },
  { size: "MEDIUM", color: 0x5a4636, emissive: 0x2a1a10, emissiveIntensity: 0.15 },
  { size: "LARGE",  color: 0x7a5a40, emissive: 0x3a2010, emissiveIntensity: 0.15 },
  { size: "BOSS",   color: 0xb01818, emissive: 0x8b0000, emissiveIntensity: 0.60 },
];

// --- Props ---

interface Props {
  readonly rooms:        readonly DungeonRoom[];
  readonly positions:    ReadonlyMap<string, THREE.Vector3>;
  readonly scene:        THREE.Scene;
  readonly onTickUpdate: (tick: ((t: number) => void) | null) => void;
}

export function DungeonRooms({ rooms, positions, scene, onTickUpdate }: Props) {
  useEffect(() => {
    const geo    = new THREE.BoxGeometry(1, 1, 1);
    const meshes: THREE.InstancedMesh[] = [];

    for (const group of SIZE_GROUPS) {
      const groupRooms = rooms.filter((r) => r.size === group.size);
      if (groupRooms.length === 0) continue;

      // One material per size group — color comes exclusively from here.
      // No setColorAt: instance colors multiply with material.color in THREE.js,
      // which would darken everything to near-black.
      const mat = new THREE.MeshStandardMaterial({
        color:             group.color,
        emissive:          group.emissive,
        emissiveIntensity: group.emissiveIntensity,
        roughness:         0.80,
        metalness:         0.10,
      });

      const mesh = new THREE.InstancedMesh(geo, mat, groupRooms.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      groupRooms.forEach((room, instIdx) => {
        const [sx, sy, sz] = ROOM_SCALE[room.size];
        const pos          = positions.get(room.id) ?? new THREE.Vector3();
        const matrix       = new THREE.Matrix4();
        matrix.compose(
          new THREE.Vector3(pos.x, pos.y + sy * 0.5, pos.z),
          new THREE.Quaternion(),
          new THREE.Vector3(sx, sy, sz)
        );
        mesh.setMatrixAt(instIdx, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;

      scene.add(mesh);
      meshes.push(mesh);
    }

    // Static geometry — no per-frame tick needed
    onTickUpdate(null);

    return () => {
      onTickUpdate(null);
      meshes.forEach((mesh) => {
        scene.remove(mesh);
        (mesh.material as THREE.MeshStandardMaterial).dispose();
      });
      geo.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, positions, scene]);

  return null;
}
