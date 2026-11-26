import { useEffect } from "react";
import type * as THREE from "three";
import type { DungeonLayout } from "../../adapter.ts";
import { createEmberField } from "./emberField.ts";
import { bossTorchRooms, dungeonBounds } from "./atmosphereHelpers.ts";
import { createTorches } from "./torches.ts";

// --- Props ---

interface Props {
  readonly layout:        DungeonLayout;
  readonly positions:     ReadonlyMap<string, THREE.Vector3>;
  readonly scene:         THREE.Scene;
  readonly reducedMotion: boolean;
  readonly onTickUpdate:  (tick: ((t: number) => void) | null) => void;
}

// --- Component ---

export function AtmosphereLayer({ layout, positions, scene, reducedMotion, onTickUpdate }: Props) {
  useEffect(() => {
    const torches = createTorches(scene, bossTorchRooms(layout, positions), reducedMotion);
    const embers = createEmberField(scene, dungeonBounds(layout.rooms, positions));
    const torchTick = torches.tick;
    if (!reducedMotion && torchTick != null) {
      onTickUpdate((time) => {
        torchTick(time);
        embers.tick(time);
      });
    } else {
      onTickUpdate(null);
    }
    return () => {
      onTickUpdate(null);
      torches.dispose();
      embers.dispose();
    };
  }, [layout, positions, scene, reducedMotion, onTickUpdate]);

  return null;
}
