// @vitest-environment jsdom
/** Unit tests for atmosphere edge cases (REQ 2.3, 2.6, 2.13). */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { mockDungeonLayout } from "../../../mock/dungeonLayout.ts";
import { STONE_FLOOR_FRAGMENT, STONE_FLOOR_VERTEX } from "../../../shaders/index.ts";
import { DungeonRooms } from "../DungeonRooms.tsx";
import { createDungeonLighting } from "../dungeonLighting.ts";
import { allocateTorches, bossRoomsOf } from "../torchAllocation.ts";
import { createTorches } from "../torches.ts";

afterEach(cleanup);

// --- Helpers ---

function collect<T extends THREE.Object3D>(scene: THREE.Scene, type: new (...args: never[]) => T): T[] {
  const found: T[] = [];
  scene.traverse((object) => {
    if (object instanceof type) found.push(object);
  });
  return found;
}

function renderRooms(scene: THREE.Scene): void {
  const positions = new Map(
    mockDungeonLayout.rooms.map((room, index) => [room.id, new THREE.Vector3(index * 12, 0, 0)]),
  );
  render(<DungeonRooms rooms={mockDungeonLayout.rooms} positions={positions} scene={scene} onTickUpdate={() => {}} />);
}

// --- Torch allocation ---

describe("empty Boss_Room list", () => {
  it("allocates nothing, and the flame mesh has count 0 with no PointLight", () => {
    expect(allocateTorches([])).toEqual([]);
    const scene = new THREE.Scene();
    const torches = createTorches(scene, [], false);
    expect(torches.flames.count).toBe(0);
    expect(collect(scene, THREE.PointLight)).toHaveLength(0);
    torches.dispose();
  });
});

describe("two Boss_Rooms", () => {
  it("lists room-001 first with two lit back corners per room", () => {
    const slots = allocateTorches(["room-002", "room-001"]);
    expect(slots[0]?.roomId).toBe("room-001");
    for (const roomId of ["room-001", "room-002"]) {
      const lit = slots.filter((slot) => slot.roomId === roomId && slot.lit).map((slot) => slot.corner);
      expect(lit.sort()).toEqual(["BACK_LEFT", "BACK_RIGHT"]);
    }
  });

  it("finds room-001 and room-002 in the sample layout, matching bossRoomIds", () => {
    const ids = bossRoomsOf(mockDungeonLayout).map((room) => room.id);
    expect(ids).toEqual(["room-001", "room-002"]);
    expect(ids).toEqual(mockDungeonLayout.bossRoomIds);
  });
});

// --- Stone floor ---

describe("Stone_Floor", () => {
  it("has non-empty shader sources", () => {
    expect(STONE_FLOOR_VERTEX.trim().length).toBeGreaterThan(0);
    expect(STONE_FLOOR_FRAGMENT.trim().length).toBeGreaterThan(0);
  });

  it("uses a ShaderMaterial for the floor and leaves no GridHelper in the scene", () => {
    const scene = new THREE.Scene();
    renderRooms(scene);
    const lighting = createDungeonLighting(scene);
    const materials: THREE.Material[] = collect(scene, THREE.InstancedMesh).flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material],
    );
    expect(materials.some((material) => material instanceof THREE.ShaderMaterial)).toBe(true);
    expect(collect(scene, THREE.GridHelper)).toHaveLength(0);
    lighting.dispose();
  });
});
