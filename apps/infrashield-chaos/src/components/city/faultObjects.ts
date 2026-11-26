import * as THREE from "three";
import { buildingHeight, buildingWidth } from "../../layout/buildingScale.ts";
import { groundPoint, setBoxPose, setSegmentPose } from "./instancePose.ts";
import { applyCollapsePose } from "./faultTick.ts";
import {
  CASCADE_STAGGER_S,
  COLOR_AFFECTED,
  COLOR_FAULTED,
  COLOR_HEALTHY,
  type BuildParams,
  type CascadeItem,
  type CollapseItem,
  type FadeItem,
} from "./faultTypes.ts";

// --- Constants ---

const EDGE_WIDTH = 0.06;

export interface FaultObjects {
  readonly collapse: CollapseItem[];
  readonly cascade: CascadeItem[];
  readonly fades: FadeItem[];
  readonly objects: THREE.InstancedMesh[];
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.Material[];
}

// --- Builder ---

/**
 * Creates one single-instance InstancedMesh per faulted node, affected node and
 * faulted edge, adds them to the scene and returns the animated items.
 * With reduced motion every item starts in its final state, so nothing animates.
 */
export function createFaultObjects(params: BuildParams): FaultObjects {
  const { nodes, edges, positions, scene, reducedMotion } = params;
  const result: FaultObjects = {
    collapse: [], cascade: [], fades: [], objects: [], geometries: [], materials: [],
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  result.geometries.push(boxGeo);

  const addMesh = (material: THREE.Material, nodeId?: string): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(boxGeo, material, 1);
    if (nodeId != null) mesh.userData = { nodeIds: [nodeId] };
    scene.add(mesh);
    result.objects.push(mesh);
    return mesh;
  };

  // --- Faulted node collapse ---
  const collapseMat = new THREE.MeshStandardMaterial({
    color: COLOR_FAULTED, emissive: COLOR_FAULTED,
    emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6,
  });
  result.materials.push(collapseMat);
  nodes.filter((n) => n.isFaulted).forEach((n) => {
    const pos  = positions.get(n.id) ?? new THREE.Vector3();
    const item: CollapseItem = {
      mesh: addMesh(collapseMat, n.id), x: pos.x, z: pos.z,
      baseHeight: buildingHeight(n.complexity), width: buildingWidth(n.complexity), startTime: -1, settled: false,
    };
    applyCollapsePose(item, reducedMotion ? 1 : 0);
    result.collapse.push(item);
  });

  // --- Affected node cascade ---
  nodes.filter((n) => n.isAffected).forEach((n, idx) => {
    const height = buildingHeight(n.complexity);
    const width  = buildingWidth(n.complexity);
    const pos    = positions.get(n.id) ?? new THREE.Vector3();
    const color  = reducedMotion ? COLOR_AFFECTED : COLOR_HEALTHY;
    const mat    = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.6,
    });
    result.materials.push(mat);
    const mesh = addMesh(mat, n.id);
    setBoxPose(mesh, 0, { x: pos.x, y: height / 2, z: pos.z }, { x: width, y: height, z: width });
    result.cascade.push({
      mesh, nodeId: n.id, revealTime: reducedMotion ? 0 : idx * CASCADE_STAGGER_S, revealed: reducedMotion,
    });
  });

  // --- Edges touching a faulted node fade out ---
  const faultedIds = new Set(nodes.filter((n) => n.isFaulted).map((n) => n.id));
  edges
    .filter((e) => faultedIds.has(e.sourceId) || faultedIds.has(e.targetId))
    .forEach((edge) => {
      const src = positions.get(edge.sourceId);
      const tgt = positions.get(edge.targetId);
      if (src == null || tgt == null) return;
      const mat = new THREE.MeshBasicMaterial({
        color: COLOR_FAULTED, transparent: true, opacity: reducedMotion ? 0 : 0.9,
      });
      result.materials.push(mat);
      const mesh = addMesh(mat);
      setSegmentPose(
        mesh, 0,
        groundPoint(src),
        groundPoint(tgt),
        EDGE_WIDTH
      );
      mesh.visible = !reducedMotion;
      result.fades.push({ mesh, startTime: -1, done: reducedMotion });
    });

  return result;
}
