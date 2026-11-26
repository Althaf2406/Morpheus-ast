import { useEffect } from "react";
import * as THREE from "three";
import type { DungeonRoom, RoomSize } from "../../adapter.ts";
import { buildRoomParts, type PartBox } from "./roomParts.ts";
import { STONE_FLOOR_FRAGMENT, STONE_FLOOR_VERTEX } from "../../shaders/index.ts";
// --- Brightened gothic stone palette ---
// Base footprint is 1.5x the previous size; keep SIZE_RADIUS in forceLayout.ts in step.
export const ROOM_SCALE: Record<RoomSize, [number, number, number]> = {
  SMALL:  [2.85, 2.4, 2.85],
  MEDIUM: [4.35, 3.3, 4.35],
  LARGE:  [6.0, 4.8, 6.0],
  BOSS:   [9.6, 7.2, 9.6],
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
// --- Stone floor: procedural shader, dark tint derived from the size group colour ---
function createFloorMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   STONE_FLOOR_VERTEX,
    fragmentShader: STONE_FLOOR_FRAGMENT,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uColor: { value: new THREE.Color(color).multiplyScalar(0.45) } },
    ]),
    fog: true,
  });
}

// --- Instancing ---
function instance(geo: THREE.BufferGeometry, mat: THREE.Material, boxes: readonly PartBox[]): THREE.InstancedMesh | null {
  if (boxes.length === 0) return null;
  const mesh   = new THREE.InstancedMesh(geo, mat, boxes.length);
  const matrix = new THREE.Matrix4();
  const quat   = new THREE.Quaternion();
  boxes.forEach((b, i) => {
    matrix.compose(new THREE.Vector3(b.x, b.y, b.z), quat, new THREE.Vector3(b.sx, b.sy, b.sz));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
// --- Props ---
interface Props {
  readonly rooms:        readonly DungeonRoom[];
  readonly positions:    ReadonlyMap<string, THREE.Vector3>;
  readonly scene:        THREE.Scene;
  readonly onTickUpdate: (tick: ((t: number) => void) | null) => void;
}
// --- Builder: adds the room instanced meshes to the scene and returns a disposer ---
export function buildRoomMeshes(
  rooms: readonly DungeonRoom[],
  positions: ReadonlyMap<string, THREE.Vector3>,
  scene: THREE.Scene,
): () => void {
  const geo       = new THREE.BoxGeometry(1, 1, 1);
  const meshes:    THREE.InstancedMesh[] = [];
  const materials: THREE.Material[]      = [];
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x300000, emissive: 0xff1a1a, emissiveIntensity: 2.2, roughness: 0.5,
  });
  materials.push(runeMat);
  for (const group of SIZE_GROUPS) {
    const groupRooms = rooms.filter((r) => r.size === group.size);
    if (groupRooms.length === 0) continue;
    // One stone material per size group; color comes exclusively from here.
    const stone = new THREE.MeshStandardMaterial({
      color:             group.color,
      emissive:          group.emissive,
      emissiveIntensity: group.emissiveIntensity,
      roughness:         0.80,
      metalness:         0.10,
    });
    const floorMat = createFloorMaterial(group.color);
    materials.push(stone, floorMat);
    const floor: PartBox[] = [], walls: PartBox[] = [], pillars: PartBox[] = [], runes: PartBox[] = [];
    for (const room of groupRooms) {
      const pos   = positions.get(room.id) ?? new THREE.Vector3();
      const parts = buildRoomParts(pos, ROOM_SCALE[room.size], room.size === "BOSS");
      floor.push(...parts.floor);
      walls.push(...parts.walls);
      pillars.push(...parts.pillars);
      runes.push(...parts.runes);
    }
    for (const mesh of [instance(geo, floorMat, floor), instance(geo, stone, walls), instance(geo, stone, pillars), instance(geo, runeMat, runes)]) {
      if (mesh == null) continue;
      scene.add(mesh);
      meshes.push(mesh);
    }
  }
  return () => {
    meshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.dispose();
    });
    materials.forEach((m) => m.dispose());
    geo.dispose();
  };
}

export function DungeonRooms({ rooms, positions, scene, onTickUpdate }: Props) {
  useEffect(() => {
    const dispose = buildRoomMeshes(rooms, positions, scene);
    // Static geometry — no per-frame tick needed
    onTickUpdate(null);
    return () => {
      onTickUpdate(null);
      dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, positions, scene]);
  return null;
}
