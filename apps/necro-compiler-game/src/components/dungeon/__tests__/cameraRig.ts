import * as fc from "fast-check";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mockDungeonLayout } from "../../../mock/dungeonLayout.ts";

// --- Generators ---
export const rooms = mockDungeonLayout.rooms;
export const coordinate = fc.double({ min: -200, max: 200, noNaN: true });
export const positionsArb: fc.Arbitrary<ReadonlyMap<string, THREE.Vector3>> = fc
  .array(fc.tuple(coordinate, coordinate, coordinate), { minLength: rooms.length, maxLength: rooms.length })
  .map((points) => new Map(rooms.map((room, i) => [room.id, new THREE.Vector3(...points[i])])));

// --- Fixtures ---
export function createRig() {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 20, 32);
  const root = new EventTarget();
  const dom = Object.assign(new EventTarget(), { style: {}, getRootNode: () => root });
  const controls = new OrbitControls(camera, dom as unknown as HTMLElement);
  return { camera, controls };
}
