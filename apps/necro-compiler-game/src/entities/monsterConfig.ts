import type { DungeonEntity, EntityType } from "../adapter.ts";

export type Severity = DungeonEntity["severity"];

// --- Per-type visual configuration ---

export interface MonsterVisualConfig {
  /** Base tint (sRGB hex), fed to the uColor uniform. */
  readonly color: string;
  /** Type-wide glow strength, fed to uIntensity. */
  readonly intensity: number;
  /** Vertex displacement amplitude (unit-sphere space), fed to uDisplace. */
  readonly displace: number;
  /** Vertical float amplitude, fed to uBobAmp. */
  readonly bobAmp: number;
  readonly bobSpeed: number;
  /** Rate of the flicker / blink / rot pulse, fed to uFlicker. */
  readonly flicker: number;
  /** Icosahedron subdivision level. */
  readonly detail: number;
  readonly stretchY: number;
  /** Multiplier on the severity radius. */
  readonly sizeScale: number;
  readonly transparent: boolean;
}

export const MONSTER_CONFIG: Record<EntityType, MonsterVisualConfig> = {
  POLTERGEIST_DEMON: {
    color: "#ff4a1c", intensity: 1.0, displace: 0.28, bobAmp: 0.1, bobSpeed: 2.2,
    flicker: 2.2, detail: 2, stretchY: 1.1, sizeScale: 1.0, transparent: false,
  },
  POLTERGEIST_DEMON_BOSS: {
    color: "#ff1f0a", intensity: 1.8, displace: 0.36, bobAmp: 0.14, bobSpeed: 1.6,
    flicker: 3.4, detail: 3, stretchY: 1.2, sizeScale: 1.6, transparent: false,
  },
  ZOMBIE_VARIABLE: {
    color: "#5f8f2a", intensity: 0.9, displace: 0.12, bobAmp: 0.12, bobSpeed: 0.9,
    flicker: 1.4, detail: 3, stretchY: 1.0, sizeScale: 0.95, transparent: false,
  },
  SHADOW_LINT_GHOST: {
    color: "#7a6cff", intensity: 1.0, displace: 0.1, bobAmp: 0.18, bobSpeed: 0.7,
    flicker: 3.0, detail: 3, stretchY: 1.35, sizeScale: 0.85, transparent: true,
  },
};

// --- Severity scaling ---

export interface SeverityVisual {
  /** World-space radius of the entity's outer envelope. */
  readonly radius: number;
  readonly intensity: number;
}

export const SEVERITY_VISUAL: Record<Severity, SeverityVisual> = {
  INFO:     { radius: 0.3,  intensity: 0.6 },
  LOW:      { radius: 0.38, intensity: 0.75 },
  MEDIUM:   { radius: 0.5,  intensity: 0.9 },
  HIGH:     { radius: 0.65, intensity: 1.1 },
  CRITICAL: { radius: 0.85, intensity: 1.4 },
};

export const MAX_SEVERITY_INTENSITY: number = Math.max(
  ...Object.values(SEVERITY_VISUAL).map((visual) => visual.intensity)
);

export function entityRadius(type: EntityType, severity: Severity): number {
  return SEVERITY_VISUAL[severity].radius * MONSTER_CONFIG[type].sizeScale;
}

/**
 * Scale from the unit icosahedron to the placed radius. Shrinks the mesh so that
 * displacement and float, at their maximum, still stay inside the envelope.
 */
export function meshFill(config: MonsterVisualConfig): number {
  const reach = 1 + config.displace * MAX_SEVERITY_INTENSITY + config.bobAmp;
  return 1 / (reach * Math.max(1, config.stretchY));
}
