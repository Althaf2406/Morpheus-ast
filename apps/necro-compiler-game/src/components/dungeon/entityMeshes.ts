import * as THREE from "three";
import type { EntityType } from "../../adapter.ts";
import type { PlacedEntity } from "../../entities/entityPlacement.ts";
import { MONSTER_CONFIG, meshFill } from "../../entities/monsterConfig.ts";
import { FRAGMENT_SOURCE, VERTEX_SOURCE } from "../../shaders/index.ts";

/** One InstancedMesh holding every entity of a single type. */
export interface MonsterBatch {
  readonly mesh: THREE.InstancedMesh;
  /** Entity id of each instance, by instance index. */
  readonly ids: readonly string[];
  /** Per-instance (dissolve, purify) pairs, rewritten as entities change state. */
  readonly stateAttr: THREE.InstancedBufferAttribute;
  readonly material: THREE.ShaderMaterial;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

// --- Material: one ShaderMaterial per entity type ---

function createMonsterMaterial(type: EntityType): THREE.ShaderMaterial {
  const config = MONSTER_CONFIG[type];
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX_SOURCE,
    fragmentShader: FRAGMENT_SOURCE[type],
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(config.color) },
        uIntensity: { value: config.intensity },
        uDisplace: { value: config.displace },
        uBobAmp: { value: config.bobAmp },
        uBobSpeed: { value: config.bobSpeed },
        uFlicker: { value: config.flicker },
      },
    ]),
    fog: true,
    transparent: config.transparent,
    depthWrite: !config.transparent,
  });
}

// --- Batch: geometry + instanced attributes ---

function createBatch(type: EntityType, entities: readonly PlacedEntity[]): MonsterBatch {
  const config = MONSTER_CONFIG[type];
  const fill = meshFill(config);
  const geometry = new THREE.IcosahedronGeometry(1, config.detail);
  const material = createMonsterMaterial(type);
  const mesh = new THREE.InstancedMesh(geometry, material, entities.length);
  // Vertices move in the shader, so the CPU bounding sphere would be wrong.
  mesh.frustumCulled = false;

  const seeds = new Float32Array(entities.length);
  const intensities = new Float32Array(entities.length);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  entities.forEach((entity, i) => {
    const size = entity.radius * fill;
    rotation.setFromAxisAngle(UP, entity.seed * Math.PI * 2);
    matrix.compose(
      new THREE.Vector3(entity.x, entity.y, entity.z),
      rotation,
      new THREE.Vector3(size, size * config.stretchY, size)
    );
    mesh.setMatrixAt(i, matrix);
    seeds[i] = entity.seed;
    intensities[i] = entity.intensity;
  });
  mesh.instanceMatrix.needsUpdate = true;

  const stateAttr = new THREE.InstancedBufferAttribute(new Float32Array(entities.length * 2), 2);
  stateAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute("aIntensity", new THREE.InstancedBufferAttribute(intensities, 1));
  geometry.setAttribute("aState", stateAttr);

  return {
    mesh,
    ids: entities.map((entity) => entity.entityId),
    stateAttr,
    material,
    dispose() {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export function buildMonsterBatches(placed: readonly PlacedEntity[]): MonsterBatch[] {
  const byType = new Map<EntityType, PlacedEntity[]>();
  for (const entity of placed) {
    byType.set(entity.type, [...(byType.get(entity.type) ?? []), entity]);
  }
  return [...byType].map(([type, entities]) => createBatch(type, entities));
}
