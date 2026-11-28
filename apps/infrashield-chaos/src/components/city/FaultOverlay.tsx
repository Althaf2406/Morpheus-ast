import { useEffect } from "react";
import type * as THREE from "three";
import type { CityEdge, CityNode } from "../../adapter.ts";
import { getAudioEngine } from "../../audio";
import { buildFaultAnimation } from "./useFaultAnimation.ts";

interface Props {
  readonly nodes: readonly CityNode[];
  readonly edges: readonly CityEdge[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
  readonly reducedMotion: boolean;
  readonly registerTick: (id: string, tick: ((elapsed: number) => void) | null) => void;
}

/** Builds the fault animation for the current layout and hooks it into the Render_Loop. */
export function FaultOverlay({ nodes, edges, positions, scene, reducedMotion, registerTick }: Props) {
  useEffect(() => {
    if (!nodes.some((n) => n.isFaulted)) return;
    const engine = getAudioEngine();
    const handle = buildFaultAnimation({
      nodes,
      edges,
      positions,
      scene,
      reducedMotion,
      onCascadeReveal: () => engine.playCascadeTick(),
    });
    registerTick("fault-anim", handle.animateTick);
    return () => {
      registerTick("fault-anim", null);
      handle.dispose();
    };
  }, [nodes, edges, positions, scene, reducedMotion, registerTick]);

  return null;
}
