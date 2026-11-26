import { useEffect, useRef, useState } from "react";
import type { DungeonLayout } from "../../adapter.ts";
import type { EntityVisualState } from "../../entities/entityTransition.ts";
import { AtmosphereLayer } from "./AtmosphereLayer.tsx";
import { DungeonCorridors } from "./DungeonCorridors.tsx";
import { DungeonInteraction } from "./DungeonInteraction.tsx";
import { DungeonRooms } from "./DungeonRooms.tsx";
import { createDungeonRig, type DungeonRig } from "./dungeonRig.ts";
import { EntityLayer } from "./EntityLayer.tsx";
import type { MonsterBatch } from "./entityMeshes.ts";
import type { PickHit } from "./monsterPicker.ts";
import { roomReach } from "./roomFocus.ts";
import { useStableRoomPositions } from "../../layout/useStableRoomPositions.ts";
import { useTickRegistry } from "./useTickRegistry.ts";

interface Props {
  readonly layout: DungeonLayout;
  readonly entityStates?: ReadonlyMap<string, EntityVisualState>;
  readonly selectedEntityId: string | null;
  readonly onSelectEntity: (entityId: string | null) => void;
  readonly onHoverEntity: (hit: PickHit | null) => void;
}

const NO_ENTITY_STATES: ReadonlyMap<string, EntityVisualState> = new Map();
const NO_BATCHES: readonly MonsterBatch[] = [];

export function DungeonScene({
  layout, entityStates = NO_ENTITY_STATES, selectedEntityId, onSelectEntity, onHoverEntity,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rig, setRig]         = useState<DungeonRig | null>(null);
  const [batches, setBatches] = useState<readonly MonsterBatch[]>(NO_BATCHES);
  const positions             = useStableRoomPositions(layout.rooms, layout.corridors);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const {
    ticksRef, handleRoomTick, handleEntityTick, handleOverlayTick, handleAtmosphereTick,
  } = useTickRegistry();

  // --- Renderer + scene setup (runs once) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (canvas == null || container == null) return;
    const created = createDungeonRig({
      canvas,
      container,
      positions,
      reach: roomReach(layout.rooms),
      onFrame: (elapsed) => {
        if (!reducedMotion) ticksRef.current.forEach((tick) => tick(elapsed));
      },
    });
    setRig(created);
    return () => {
      created.dispose();
      setRig(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        aria-label="Dungeon view. Click a monster to select it."
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {rig != null && (
        <>
          <DungeonRooms
            rooms={layout.rooms}
            positions={positions}
            scene={rig.scene}
            onTickUpdate={handleRoomTick}
          />
          <AtmosphereLayer
            layout={layout}
            positions={positions}
            scene={rig.scene}
            reducedMotion={reducedMotion}
            onTickUpdate={handleAtmosphereTick}
          />
          <DungeonCorridors
            corridors={layout.corridors}
            rooms={layout.rooms}
            positions={positions}
            scene={rig.scene}
          />
          <EntityLayer
            rooms={layout.rooms}
            positions={positions}
            scene={rig.scene}
            entityStates={entityStates}
            reducedMotion={reducedMotion}
            onBatches={setBatches}
            onTickUpdate={handleEntityTick}
          />
          <DungeonInteraction
            rig={rig}
            batches={batches}
            rooms={layout.rooms}
            positions={positions}
            entityStates={entityStates}
            selectedEntityId={selectedEntityId}
            reducedMotion={reducedMotion}
            onHover={onHoverEntity}
            onSelect={onSelectEntity}
            onTickUpdate={handleOverlayTick}
          />
        </>
      )}
    </div>
  );
}
