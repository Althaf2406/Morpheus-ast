import * as THREE from "three";
import type { CityNode, CityEdge } from "../adapter";

// --- Constants ---

const ITERATIONS = 200;
const ATTRACTION_K = 0.02;
const GRAVITY_K = 0.05; // strong pull toward the centroid keeps the city dense
const MAX_DISPLACEMENT = 1.0;
const SEPARATION_PASSES = 400;
const SEPARATION_EPSILON = 0.01;

// --- Types ---

export interface CityForceLayoutResult {
  readonly positions: ReadonlyMap<string, THREE.Vector3>;
}

interface Field {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly r: Float64Array;
}

// --- Helpers ---

/** Building footprint half-extent; drives both the separation and the final overlap check. */
function footprintRadius(node: CityNode): number {
  return Math.max(node.complexity * 0.4, 1.2);
}

/**
 * Deterministic shelf packing, largest footprints first, sized from the total footprint area.
 * Seeds the solver with a non-overlapping, compact arrangement centred on the origin.
 */
function seedShelves(field: Field): void {
  const n = field.r.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => field.r[b] - field.r[a] || a - b);
  let totalArea = 0;
  for (let i = 0; i < n; i++) totalArea += 4 * field.r[i] * field.r[i];
  const rowWidth = Math.sqrt(totalArea);

  let cursorX = 0;
  let rowZ = 0;
  let rowHeight = 0;
  for (const i of order) {
    const size = 2 * field.r[i];
    if (cursorX > 0 && cursorX + size > rowWidth) {
      rowZ += rowHeight;
      cursorX = 0;
      rowHeight = 0;
    }
    field.x[i] = cursorX + field.r[i];
    field.z[i] = rowZ + field.r[i];
    cursorX += size;
    rowHeight = Math.max(rowHeight, size);
  }

  let sumX = 0;
  let sumZ = 0;
  for (let i = 0; i < n; i++) {
    sumX += field.x[i];
    sumZ += field.z[i];
  }
  for (let i = 0; i < n; i++) {
    field.x[i] -= sumX / n;
    field.z[i] -= sumZ / n;
  }
}

/** Pushes every overlapping pair apart; returns true when any pair overlapped. */
function separatePass(field: Field): boolean {
  const { x, z, r } = field;
  const n = r.length;
  let anyOverlap = false;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const dx = x[a] - x[b];
      const dz = z[a] - z[b];
      const minSep = r[a] + r[b];
      if (Math.abs(dx) >= minSep || Math.abs(dz) >= minSep) continue;
      const dist = Math.hypot(dx, dz);
      if (dist >= minSep) continue;
      anyOverlap = true;
      const push = (minSep - dist) / 2 + SEPARATION_EPSILON;
      const ux = dist < 0.0001 ? 1 : dx / dist;
      const uz = dist < 0.0001 ? 0 : dz / dist;
      x[a] += ux * push;
      z[a] += uz * push;
      x[b] -= ux * push;
      z[b] -= uz * push;
    }
  }
  return anyOverlap;
}

// --- Main export ---

export function computeCityForceLayout(
  nodes: readonly CityNode[],
  edges: readonly CityEdge[]
): CityForceLayoutResult {
  const n = nodes.length;

  if (n === 0) {
    return { positions: new Map() };
  }

  const field: Field = {
    x: new Float64Array(n),
    z: new Float64Array(n),
    r: Float64Array.from(nodes.map(footprintRadius)),
  };
  seedShelves(field);

  const idToIndex = new Map<string, number>(nodes.map((node, i) => [node.id, i]));
  const links: Array<readonly [number, number]> = [];
  for (const edge of edges) {
    const ia = idToIndex.get(edge.sourceId);
    const ib = idToIndex.get(edge.targetId);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    links.push([ia, ib]);
  }

  const fx = new Float64Array(n);
  const fz = new Float64Array(n);

  // --- Iterate: edge springs and gravity, then keep buildings apart ---
  for (let iter = 0; iter < ITERATIONS; iter++) {
    fx.fill(0);
    fz.fill(0);

    for (const [ia, ib] of links) {
      const dx = field.x[ib] - field.x[ia];
      const dz = field.z[ib] - field.z[ia];
      fx[ia] += dx * ATTRACTION_K;
      fz[ia] += dz * ATTRACTION_K;
      fx[ib] -= dx * ATTRACTION_K;
      fz[ib] -= dz * ATTRACTION_K;
    }

    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i++) {
      cx += field.x[i];
      cz += field.z[i];
    }
    cx /= n;
    cz /= n;

    for (let i = 0; i < n; i++) {
      fx[i] -= (field.x[i] - cx) * GRAVITY_K;
      fz[i] -= (field.z[i] - cz) * GRAVITY_K;
      const len = Math.hypot(fx[i], fz[i]);
      const scale = len > MAX_DISPLACEMENT ? MAX_DISPLACEMENT / len : 1;
      field.x[i] += fx[i] * scale;
      field.z[i] += fz[i] * scale;
    }

    separatePass(field);
  }

  // --- Hard-separation pass: guarantee no overlap ---
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    if (!separatePass(field)) break;
  }

  // --- Build result map on the flat plane ---
  const result = new Map<string, THREE.Vector3>();
  nodes.forEach((node, i) => {
    result.set(node.id, new THREE.Vector3(field.x[i], 0, field.z[i]));
  });

  return { positions: result };
}
