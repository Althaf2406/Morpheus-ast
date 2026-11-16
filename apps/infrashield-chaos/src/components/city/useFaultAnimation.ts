import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityNode, CityEdge } from "../../adapter.ts";

// --- Animation constants ---
export const COLOR_FAULTED  = new THREE.Color("#ff2222");
export const COLOR_AFFECTED = new THREE.Color("#ffaa00");
export const COLOR_HEALTHY  = new THREE.Color("#00e5ff");

export const CASCADE_STAGGER_S = 0.15; // seconds between amber reveal steps
const COLLAPSE_DURATION        = 1.2;  // seconds
const FADE_DURATION            = 0.6;  // seconds

// --- Types ---
interface CollapseMesh { mesh: THREE.Mesh; startTime: number; baseHeight: number }
interface CascadeMesh  { mesh: THREE.Mesh; nodeId: string; revealTime: number; revealed: boolean }
interface FadeLine     { line: THREE.LineSegments; startTime: number; done: boolean }

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

/**
 * Pure factory — creates all Three.js objects, returns a tick + dispose handle.
 * No React hooks inside; the React hook below just calls this and cleans up.
 */
export function buildFaultAnimation(params: BuildParams): FaultAnimationHandle {
  const { nodes, edges, positions, scene, reducedMotion } = params;

  const faultedIds = new Set(nodes.filter((n) => n.isFaulted).map((n) => n.id));
  const faultedNodes = nodes.filter((n) => n.isFaulted);
  const affectedNodes = nodes.filter((n) => n.isAffected);

  const addedObjects: THREE.Object3D[] = [];

  // --- Faulted node collapse meshes ---
  const collapseMeshes: CollapseMesh[] = [];
  const collapseGeo = new THREE.BoxGeometry(1, 1, 1);
  const collapseMat = new THREE.MeshStandardMaterial({
    color: COLOR_FAULTED, emissive: COLOR_FAULTED,
    emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6,
  });

  faultedNodes.forEach((n) => {
    const height = Math.max(n.complexity * 0.5, 0.5);
    const pos    = positions.get(n.id) ?? new THREE.Vector3();
    const mesh   = new THREE.Mesh(collapseGeo, collapseMat);
    mesh.position.set(pos.x, height * 0.5, pos.z);
    mesh.scale.set(1, height, 1);
    scene.add(mesh);
    addedObjects.push(mesh);
    collapseMeshes.push({ mesh, startTime: -1, baseHeight: height });
  });

  // --- Cascade (affected) node meshes ---
  const cascadeMeshes: CascadeMesh[] = [];
  const cascadeGeo = new THREE.BoxGeometry(1, 1, 1);

  affectedNodes.forEach((n, idx) => {
    const height     = Math.max(n.complexity * 0.5, 0.5);
    const pos        = positions.get(n.id) ?? new THREE.Vector3();
    const revealTime = reducedMotion ? 0 : idx * CASCADE_STAGGER_S;
    const initColor  = reducedMotion ? COLOR_AFFECTED : COLOR_HEALTHY;
    const mat        = new THREE.MeshStandardMaterial({
      color: initColor, emissive: initColor,
      emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.6,
    });
    const mesh = new THREE.Mesh(cascadeGeo, mat);
    mesh.position.set(pos.x, height * 0.5, pos.z);
    mesh.scale.set(1, height, 1);
    scene.add(mesh);
    addedObjects.push(mesh);
    // Reduced motion: treat as already revealed at time 0
    cascadeMeshes.push({ mesh, nodeId: n.id, revealTime, revealed: reducedMotion });
  });

  // --- Edge fade lines for edges connected to faulted nodes ---
  const fadeLines: FadeLine[] = [];
  const faultEdges = edges.filter(
    (e) => faultedIds.has(e.sourceId) || faultedIds.has(e.targetId)
  );

  faultEdges.forEach((edge) => {
    const srcPos  = positions.get(edge.sourceId);
    const tgtPos  = positions.get(edge.targetId);
    if (srcPos == null || tgtPos == null) return;

    const srcNode = nodes.find((n) => n.id === edge.sourceId);
    const tgtNode = nodes.find((n) => n.id === edge.targetId);
    const srcH    = srcNode != null ? Math.max(srcNode.complexity * 0.5, 0.5) : 0.5;
    const tgtH    = tgtNode != null ? Math.max(tgtNode.complexity * 0.5, 0.5) : 0.5;

    const posArr = new Float32Array([
      srcPos.x, srcH, srcPos.z,
      tgtPos.x, tgtH, tgtPos.z,
    ]);
    const geo  = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const mat  = new THREE.LineBasicMaterial({
      color: new THREE.Color("#ff2222"),
      transparent: true,
      opacity: reducedMotion ? 0 : 0.9,
    });
    const line = new THREE.LineSegments(geo, mat);
    scene.add(line);
    addedObjects.push(line);
    fadeLines.push({ line, startTime: -1, done: reducedMotion });
  });

  // --- Tick function ---
  let startEpoch = -1;

  const animateTick = (elapsedTime: number): void => {
    if (startEpoch < 0) startEpoch = elapsedTime;
    const localT = elapsedTime - startEpoch;

    // Faulted node collapse
    collapseMeshes.forEach((cm) => {
      if (cm.startTime < 0) cm.startTime = elapsedTime;
      const age = elapsedTime - cm.startTime;
      if (reducedMotion) {
        cm.mesh.scale.set(1.05, 0.05, 1.05);
        cm.mesh.rotation.z = 0.25;
        return;
      }
      const progress = Math.min(age / COLLAPSE_DURATION, 1);
      const pulse    = 1 + 0.1 * Math.sin(elapsedTime * 5);
      const scaleY   = cm.baseHeight * (1 - progress * 0.95) * (progress < 1 ? pulse : 1);
      cm.mesh.scale.set(1 + progress * 0.1, Math.max(scaleY, 0.05), 1 + progress * 0.1);
      cm.mesh.rotation.z = progress * 0.25;
      cm.mesh.position.y = Math.max(scaleY * 0.5, 0.025);
    });

    // Cascade amber reveal
    cascadeMeshes.forEach((cm) => {
      if (cm.revealed) return;
      if (localT >= cm.revealTime) {
        const mat = cm.mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(COLOR_AFFECTED);
        mat.emissive.set(COLOR_AFFECTED);
        cm.revealed = true;
      }
    });

    // Edge fade-out
    fadeLines.forEach((fl) => {
      if (fl.done) return;
      if (fl.startTime < 0) fl.startTime = elapsedTime;
      const age      = elapsedTime - fl.startTime;
      const progress = Math.min(age / FADE_DURATION, 1);
      const mat      = fl.line.material as THREE.LineBasicMaterial;
      mat.opacity    = 0.9 * (1 - progress);
      if (progress >= 1) {
        fl.line.visible = false;
        fl.done = true;
      }
    });
  };

  // --- Dispose ---
  const dispose = (): void => {
    collapseMeshes.forEach(({ mesh }) => scene.remove(mesh));
    collapseGeo.dispose();
    collapseMat.dispose();

    cascadeMeshes.forEach(({ mesh }) => {
      scene.remove(mesh);
      (mesh.material as THREE.MeshStandardMaterial).dispose();
    });
    cascadeGeo.dispose();

    fadeLines.forEach(({ line }) => {
      scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.LineBasicMaterial).dispose();
    });

    addedObjects.length = 0;
  };

  return {
    animateTick,
    dispose,
    revealedAffectedIds: () =>
      new Set(cascadeMeshes.filter((cm) => cm.revealed).map((cm) => cm.nodeId)),
    addedObjects: () => addedObjects,
  };
}

// ─── React hook wrapper ───────────────────────────────────────────────────────

export type UseFaultParams = BuildParams;

/**
 * React hook: calls buildFaultAnimation and registers its tick with the scene.
 * Returns the handle so callers can register the tick with registerTick.
 */
export function useFaultAnimation(params: UseFaultParams): void {
  const handleRef = useRef<FaultAnimationHandle | null>(null);

  useEffect(() => {
    const hasFault = params.nodes.some((n) => n.isFaulted);
    if (!hasFault || params.scene == null) return;

    const handle = buildFaultAnimation(params);
    handleRef.current = handle;

    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.nodes, params.edges, params.positions, params.scene, params.reducedMotion]);
}
