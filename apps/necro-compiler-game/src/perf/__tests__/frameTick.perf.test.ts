/**
 * Perf test: one Frame_Loop tick on the Large_Layout, CPU only (no render call).
 *
 * **Feature: necro-visual-polish, Property 23: One Frame_Loop tick stays within the per-frame time budget**
 * **Validates: Requirements 5.2, 5.6**
 */
import type * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EntityVisualState } from "../../entities/entityTransition.ts";
import { createCameraGlide, type CameraGlide } from "../../components/dungeon/cameraGlide.ts";
import { createEntityDriver, type EntityDriver } from "../../components/dungeon/entityDriver.ts";
import { createRig } from "../../components/dungeon/__tests__/cameraRig.ts";
import { buildPerfScene, type PerfScene } from "../buildPerfScene.ts";
import { largeLayout } from "../largeLayout.ts";
import { medianOfFive } from "../measure.ts";

// --- Budget ---
const BUDGET_MS = 16;
const FRAME_SECONDS = 1 / 60;

// --- Fixtures: built once, released after the suite ---
let perfScene: PerfScene;
let driver: EntityDriver;
let glide: CameraGlide;
let controlsDispose: () => void;
let focusTarget: THREE.Vector3;

beforeAll(() => {
  perfScene = buildPerfScene(largeLayout);
  const states: ReadonlyMap<string, EntityVisualState> = new Map();
  driver = createEntityDriver(perfScene.batches, () => states, false);
  const { camera, controls } = createRig();
  glide = createCameraGlide(camera, controls, false, perfScene.positions);
  controlsDispose = () => controls.dispose();
  const first = perfScene.positions.values().next();
  if (first.done === true) throw new Error("Large_Layout produced no room positions");
  focusTarget = first.value;
});

afterAll(() => {
  glide.dispose();
  controlsDispose();
  perfScene.dispose();
});

// --- One tick: entity driver, camera glide, torch and ember ---
let clock = 0;
function tickOnce(): void {
  clock += FRAME_SECONDS;
  glide.focus(focusTarget);
  driver.tick(clock);
  glide.tick(clock);
  perfScene.torches.tick?.(clock);
  perfScene.embers.tick(clock);
}

describe("Frame_Loop tick perf on Large_Layout", () => {
  it("runs one tick within the per-frame time budget", () => {
    expect(largeLayout.rooms).toHaveLength(300);
    expect(perfScene.batches.length).toBeGreaterThan(0);
    const median = medianOfFive(tickOnce);
    expect(median).toBeLessThanOrEqual(BUDGET_MS);
  });
});
