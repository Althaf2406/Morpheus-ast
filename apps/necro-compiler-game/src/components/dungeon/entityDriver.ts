import {
  advanceTrack,
  reviveProgress,
  transitionProgress,
  type EntityVisualState,
  type PhaseTrack,
} from "../../entities/entityTransition.ts";
import type { MonsterBatch } from "./entityMeshes.ts";

export interface EntityDriver {
  /** Per-frame tick: advances shader time, then syncs state. */
  readonly tick: (time: number) => void;
  /** Applies the current entity states at clock time `now`. */
  readonly sync: (now: number) => void;
}

/**
 * Drives the per-instance aState attribute from the entityStates map.
 * Entities already in a non-ALIVE phase at creation start at their end pose.
 */
export function createEntityDriver(
  batches: readonly MonsterBatch[],
  readStates: () => ReadonlyMap<string, EntityVisualState>,
  reducedMotion: boolean
): EntityDriver {
  const tracks = new Map<string, PhaseTrack>();
  /** Entities whose ALIVE phase follows an undo, and so fade back in. */
  const reviving = new Set<string>();
  const initial = readStates();
  for (const batch of batches) {
    for (const id of batch.ids) {
      tracks.set(id, { phase: initial.get(id) ?? "ALIVE", since: -Infinity });
    }
  }

  const sync = (now: number): void => {
    const states = readStates();
    for (const batch of batches) {
      const values = batch.stateAttr.array as Float32Array;
      let changed = false;
      batch.ids.forEach((id, i) => {
        const previous = tracks.get(id);
        const track = advanceTrack(previous, states.get(id) ?? "ALIVE", now);
        tracks.set(id, track);
        if (track !== previous) {
          if (previous !== undefined && previous.phase !== "ALIVE" && track.phase === "ALIVE") reviving.add(id);
          else reviving.delete(id);
        }
        const elapsed = now - track.since;
        const progress = reviving.has(id)
          ? reviveProgress(elapsed, reducedMotion)
          : transitionProgress(track.phase, elapsed, reducedMotion);
        const dissolve = Math.fround(progress.dissolve);
        const purify = Math.fround(progress.purify);
        if (values[i * 2] !== dissolve || values[i * 2 + 1] !== purify) {
          values[i * 2] = dissolve;
          values[i * 2 + 1] = purify;
          changed = true;
        }
      });
      if (changed) batch.stateAttr.needsUpdate = true;
    }
  };

  return {
    sync,
    tick: (time) => {
      for (const batch of batches) batch.material.uniforms.uTime.value = time;
      sync(time);
    },
  };
}
