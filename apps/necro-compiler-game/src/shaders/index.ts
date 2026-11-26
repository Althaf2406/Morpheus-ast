import type { EntityType } from "../adapter.ts";
import commonSource from "./common.glsl?raw";
import noiseSource from "./noise.glsl?raw";
import lifecycleSource from "./lifecycle.glsl?raw";
import vertexMain from "./monster.vert.glsl?raw";
import demonMain from "./demon.frag.glsl?raw";
import zombieMain from "./zombie.frag.glsl?raw";
import ghostMain from "./ghost.frag.glsl?raw";

// --- Assembly: shared chunks first, then the stage's own main() ---

const vertexShared = [commonSource, noiseSource].join("\n");
const fragmentShared = [commonSource, noiseSource, lifecycleSource].join("\n");

export const VERTEX_SOURCE: string = `${vertexShared}\n${vertexMain}`;

/** One fragment shader per entity type; the boss reuses the demon shader with a harsher config. */
export const FRAGMENT_SOURCE: Record<EntityType, string> = {
  POLTERGEIST_DEMON: `${fragmentShared}\n${demonMain}`,
  POLTERGEIST_DEMON_BOSS: `${fragmentShared}\n${demonMain}`,
  ZOMBIE_VARIABLE: `${fragmentShared}\n${zombieMain}`,
  SHADOW_LINT_GHOST: `${fragmentShared}\n${ghostMain}`,
};
