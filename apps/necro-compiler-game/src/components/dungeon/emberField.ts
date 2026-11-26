import * as THREE from "three";

// --- Types ---

export interface EmberBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface EmberField {
  readonly points: THREE.Points;
  tick(time: number): void;
  dispose(): void;
}

// --- Constants ---

export const EMBER_COUNT = 400;
const RISE_SPEED_MIN = 0.15;
const RISE_SPEED_SPAN = 0.35;
const SWAY_AMPLITUDE = 0.4;
const EMBER_SIZE = 0.18;
const EMBER_COLOR = 0xffa050;

// --- Helpers ---

/** Deterministic pseudo-random sequence in [0, 1) so layouts render identically. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}

// --- Factory ---

/**
 * Creates the single dust and ember `Points` object and adds it to `scene`.
 * Positions are a pure function of time, so skipping `tick` leaves the
 * particles at their initial positions (reduced motion).
 */
export function createEmberField(scene: THREE.Scene, bounds: EmberBounds): EmberField {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const height = Math.max(maxY - minY, 1e-6);
  const next = sequence(EMBER_COUNT);

  const home = new Float32Array(EMBER_COUNT * 3);
  const speeds = new Float32Array(EMBER_COUNT);
  const phases = new Float32Array(EMBER_COUNT);
  for (let i = 0; i < EMBER_COUNT; i++) {
    home[i * 3]     = minX + next() * (maxX - minX);
    home[i * 3 + 1] = next() * height;
    home[i * 3 + 2] = minZ + next() * (maxZ - minZ);
    speeds[i] = RISE_SPEED_MIN + next() * RISE_SPEED_SPAN;
    phases[i] = next() * Math.PI * 2;
  }

  const buffer = new Float32Array(EMBER_COUNT * 3);
  for (let i = 0; i < EMBER_COUNT; i++) {
    buffer[i * 3]     = home[i * 3];
    buffer[i * 3 + 1] = minY + home[i * 3 + 1];
    buffer[i * 3 + 2] = home[i * 3 + 2];
  }

  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(buffer, 3);
  geometry.setAttribute("position", attribute);

  const material = new THREE.PointsMaterial({
    color: EMBER_COLOR,
    size: EMBER_SIZE,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  return {
    points,
    tick(time: number) {
      for (let i = 0; i < EMBER_COUNT; i++) {
        const rise = wrap(home[i * 3 + 1] + speeds[i] * time, height);
        buffer[i * 3]     = home[i * 3] + Math.sin(time * 0.5 + phases[i]) * SWAY_AMPLITUDE;
        buffer[i * 3 + 1] = minY + rise;
        buffer[i * 3 + 2] = home[i * 3 + 2] + Math.cos(time * 0.4 + phases[i]) * SWAY_AMPLITUDE;
      }
      attribute.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
