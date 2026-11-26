import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { frameCamera } from "../../layout/frameCamera.ts";
import { createDungeonLighting } from "./dungeonLighting.ts";

// --- Constants ---

const BACKGROUND_COLOR = 0x0d0a08;
const FOG_COLOR = 0x1a2230;
const BLOOM_STRENGTH = 0.6;
const BLOOM_RADIUS = 0.5;
const BLOOM_THRESHOLD = 0.85;

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
  /** Footprint radius per room id, so the first frame fits whole rooms and not just their centres. */
  readonly reach: ReadonlyMap<string, number>;
  /** Runs once per frame, before rendering, with the elapsed clock time in seconds. */
  readonly onFrame: (elapsed: number) => void;
}

export function createDungeonRig({ canvas, container, positions, reach, onFrame }: RigOptions): DungeonRig {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let width = container.clientWidth;
  let height = container.clientHeight;
  renderer.setSize(width, height, false);

  // --- Colour pipeline: scene passes render linear HDR; OutputPass is the only tone mapping and sRGB step ---
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --- Scene ---
  const frame = frameCamera(positions, reach);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, frame.camDist, frame.camDist * 4);
  const lighting = createDungeonLighting(scene);

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

  // --- Post-processing: scene render, bloom on emissive flames, then output conversion ---
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(width, height);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  const clock = new THREE.Clock();
  clock.start();
  let rafId = 0;
  const render = () => {
    rafId = requestAnimationFrame(render);
    onFrame(clock.getElapsedTime());
    controls.update();
    if (width === 0 || height === 0) return;
    composer.render();
  };
  rafId = requestAnimationFrame(render);

  const observer = new ResizeObserver(() => {
    width = container.clientWidth;
    height = container.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
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
      renderPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
