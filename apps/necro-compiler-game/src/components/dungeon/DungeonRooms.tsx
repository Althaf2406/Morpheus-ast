import { useEffect } from "react";
import * as THREE from "three";
import type { DungeonRoom, RoomSize } from "../../adapter.ts";
import { buildRoomParts, type PartBox } from "./roomParts.ts";
import { STONE_FLOOR_FRAGMENT, STONE_FLOOR_VERTEX } from "../../shaders/index.ts";
// --- Room extents: footprint is about 0.75x the SIZE_RADIUS spacing in forceLayout.ts, so rooms sit close with a visible gap ---
export const ROOM_SCALE: Record<RoomSize, [number, number, number]> = {
  SMALL:  [5.7, 4.8, 5.7],
  MEDIUM: [8.7, 6.6, 8.7],
  LARGE:  [12.0, 9.6, 12.0],
  BOSS:   [19.2, 14.4, 19.2],
};
// --- Group definition ---
interface SizeGroup {
  readonly size:              RoomSize;
  readonly color:             number;
  readonly emissive:          number;
  readonly emissiveIntensity: number;
}
const SIZE_GROUPS: readonly SizeGroup[] = [
  { size: "SMALL",  color: 0x3a3a5c, emissive: 0x1a1a2e, emissiveIntensity: 0.15 },
  { size: "MEDIUM", color: 0x5a4636, emissive: 0x2a1a10, emissiveIntensity: 0.15 },
  { size: "LARGE",  color: 0x7a5a40, emissive: 0x3a2010, emissiveIntensity: 0.15 },
  { size: "BOSS",   color: 0xb01818, emissive: 0x8b0000, emissiveIntensity: 0.60 },
];
// --- Stone floor ---
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
    onTickUpdate(null);
    return () => {
      onTickUpdate(null);
      dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, positions, scene]);
  return null;
}
