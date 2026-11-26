// --- Constants ---
/** Complexity at which footprint and height stop growing. */
export const COMPLEXITY_CAP = 40;
export const MIN_FOOTPRINT_RADIUS = 1.2;
export const MAX_FOOTPRINT_RADIUS = 3;
export const MIN_BUILDING_HEIGHT = 0.8;
export const MAX_BUILDING_HEIGHT = 14;
/** Share of the footprint diameter a building fills; the rest is street. */
const BUILDING_FILL = 0.6;
// --- Scale ---
/** Square-root growth in 0..1: low complexities still differ, high ones cannot run away. */
function scaleUnit(complexity: number): number {
  const clamped = Math.min(Math.max(Number.isFinite(complexity) ? complexity : 0, 0), COMPLEXITY_CAP);
  return Math.sqrt(clamped / COMPLEXITY_CAP);
}
/** Half-extent of the ground area reserved for a building; the layout separates buildings by it. */
export function footprintRadius(complexity: number): number {
  return MIN_FOOTPRINT_RADIUS + (MAX_FOOTPRINT_RADIUS - MIN_FOOTPRINT_RADIUS) * scaleUnit(complexity);
}
/** Side length of the rendered building box. */
export function buildingWidth(complexity: number): number {
  return 2 * footprintRadius(complexity) * BUILDING_FILL;
}
/** Building height, bounded and non-decreasing in complexity. */
export function buildingHeight(complexity: number): number {
  return MIN_BUILDING_HEIGHT + (MAX_BUILDING_HEIGHT - MIN_BUILDING_HEIGHT) * scaleUnit(complexity);
}
