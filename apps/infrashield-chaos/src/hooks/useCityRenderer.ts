import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CameraFrame } from "../layout/frameCamera.ts";

// --- Constants ---

const BACKGROUND   = 0x0a0e14;
const FOG_FACTOR   = 0.6; // fog density = FOG_FACTOR / camera distance
const MIN_DISTANCE = 5;

// --- Types ---

export type Tick = (elapsed: number) => void;

export interface CityView {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
}

export interface CityRenderer {
  readonly canvasRef: RefObject<HTMLCanvasElement>;
  /** Null until the WebGL scene exists. */
  readonly view: CityView | null;
  /** Adds (or with null removes) a per-frame callback run by the single Render_Loop. */
  readonly registerTick: (id: string, tick: Tick | null) => void;
}

interface Rig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly scene: THREE.Scene;
}

// --- Helpers ---

function applyFrame({ camera, controls, scene }: Rig, frame: CameraFrame): void {
  camera.position.copy(frame.position);
  controls.target.copy(frame.target);
  controls.maxDistance = frame.maxDistance;
  if (scene.fog instanceof THREE.FogExp2) scene.fog.density = FOG_FACTOR / frame.camDist;
  controls.update();
}

// --- Hook ---

/** Owns the renderer, camera, controls and the one requestAnimationFrame loop. */
export function useCityRenderer(frame: CameraFrame): CityRenderer {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ticksRef  = useRef<Map<string, Tick>>(new Map());
  const frameRef  = useRef(frame);
  const rigRef    = useRef<Rig | null>(null);
  const [view, setView] = useState<CityView | null>(null);

  const registerTick = useCallback((id: string, tick: Tick | null) => {
    if (tick == null) ticksRef.current.delete(id);
    else ticksRef.current.set(id, tick);
  }, []);

  // --- Renderer, scene and loop (created once, fully disposed on unmount) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(BACKGROUND);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(BACKGROUND, 0.018);
    const dirLight = new THREE.DirectionalLight(0xc0d8ff, 1.2);
    dirLight.position.set(0, 20, 10);
    scene.add(new THREE.AmbientLight(0x1a2a4a, 0.6), dirLight);

    const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance   = MIN_DISTANCE;

    const rig: Rig = { camera, controls, scene };
    rigRef.current = rig;
    applyFrame(rig, frameRef.current);
    setView({ scene, camera });

    // --- Single Render_Loop ---
    const clock = new THREE.Clock();
    let rafId = requestAnimationFrame(function render() {
      rafId = requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();
      ticksRef.current.forEach((tick) => tick(elapsed));
      controls.update();
      renderer.render(scene, camera);
    });

    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = h > 0 ? w / h : 1;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      applyFrame(rig, frameRef.current);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      ticksRef.current.clear();
      rigRef.current = null;
      controls.dispose();
      renderer.dispose();
      setView(null);
    };
  }, []);

  // --- Re-frame the camera whenever the building positions change ---
  useEffect(() => {
    frameRef.current = frame;
    if (rigRef.current != null) applyFrame(rigRef.current, frame);
  }, [frame]);

  return { canvasRef, view, registerTick };
}
