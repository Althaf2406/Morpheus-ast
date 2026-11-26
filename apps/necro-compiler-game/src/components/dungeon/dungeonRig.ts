import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { frameCamera } from "../../layout/frameCamera.ts";
import { createDungeonLighting } from "./dungeonLighting.ts";

/** Renderer, scene, camera and the single render loop of the dungeon view. */
export interface DungeonRig {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly dom: HTMLCanvasElement;
  dispose(): void;
}

export interface RigOptions {
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
  /** Runs once per frame, before rendering, with the elapsed clock time in seconds. */
  readonly onFrame: (elapsed: number) => void;
}

export function createDungeonRig({ canvas, container, positions, onFrame }: RigOptions): DungeonRig {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Size comes from the container; updateStyle=false keeps the canvas CSS at 100%.
  let width = container.clientWidth;
  let height = container.clientHeight;
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x0d0a08);

  // Compute camera frame first: fog near/far depend on camDist.
  const frame = frameCamera(positions);
  const scene = new THREE.Scene();
  // Linear fog scaled to camera distance: only the far background fades,
  // however compact or spread the layout is.
  scene.fog = new THREE.Fog(0x0d0a08, frame.camDist * 0.8, frame.camDist * 3);
  const lighting = createDungeonLighting(scene);

  // Auto-frame: position camera to show all rooms on first load
  const camera = new THREE.PerspectiveCamera(55, height > 0 ? width / height : 1, 0.1, 2000);
  camera.position.copy(frame.position);
  camera.lookAt(frame.target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = frame.maxDistance;
  controls.target.copy(frame.target);
  controls.update();

  const clock = new THREE.Clock();
  clock.start();
  let rafId = 0;
  const render = () => {
    rafId = requestAnimationFrame(render);
    onFrame(clock.getElapsedTime());
    controls.update();
    if (width === 0 || height === 0) return;
    renderer.render(scene, camera);
  };
  rafId = requestAnimationFrame(render);

  const observer = new ResizeObserver(() => {
    width = container.clientWidth;
    height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  });
  observer.observe(container);

  return {
    scene,
    camera,
    controls,
    dom: renderer.domElement,
    dispose() {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      lighting.dispose();
      controls.dispose();
      renderer.dispose();
    },
  };
}
