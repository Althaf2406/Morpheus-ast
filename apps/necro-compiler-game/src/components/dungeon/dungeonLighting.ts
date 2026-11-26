import * as THREE from "three";

// --- Dispose helper ---

type Disposable = { dispose(): void };

/** Tracks objects to dispose on scene teardown. */
export interface LightingRig {
  readonly lights: THREE.Object3D[];
  dispose():       void;
}

// --- Factory ---

/**
 * Creates and adds the full dungeon lighting rig to `scene`:
 *   - AmbientLight  — bright cold base fill
 *   - HemisphereLight — sky/ground gradient for depth
 *   - DirectionalLight — warm torch-flavoured key light
 *
 * Returns a `LightingRig` whose `dispose()` removes everything and frees GPU
 * resources. Call it inside the effect cleanup to prevent leaks on unmount.
 */
export function createDungeonLighting(scene: THREE.Scene): LightingRig {
  const ambient = new THREE.AmbientLight(0x9988bb, 1.2);

  const hemi = new THREE.HemisphereLight(
    0x6a5a8a, // sky: cool purple-grey
    0x2a1a10, // ground: warm dark brown
    0.8
  );

  const dirLight = new THREE.DirectionalLight(0xffaa44, 1.0);
  dirLight.position.set(5, 15, 8);

  scene.add(ambient, hemi, dirLight);

  const disposables: Disposable[] = [ambient, hemi, dirLight];

  return {
    lights: [ambient, hemi, dirLight],
    dispose() {
      scene.remove(ambient, hemi, dirLight);
      disposables.forEach((d) => d.dispose());
    },
  };
}
