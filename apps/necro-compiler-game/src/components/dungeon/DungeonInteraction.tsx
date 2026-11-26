import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DungeonRoom } from "../../adapter.ts";
import type { EntityVisualState } from "../../entities/entityTransition.ts";
import { PALETTE } from "../../hud/palette.ts";
import { createCameraGlide, type CameraGlide } from "./cameraGlide.ts";
import type { DungeonRig } from "./dungeonRig.ts";
import type { MonsterBatch } from "./entityMeshes.ts";
import { createMonsterGlow, type MonsterGlow } from "./monsterGlow.ts";
import { createMonsterPicker, locateInstance, type PickHit } from "./monsterPicker.ts";
import { roomFocusTarget, roomReach } from "./roomFocus.ts";

// --- Props ---
interface Props {
  readonly rig:              DungeonRig;
  readonly batches:          readonly MonsterBatch[];
  readonly rooms:            readonly DungeonRoom[];
  readonly positions:        ReadonlyMap<string, THREE.Vector3>;
  readonly entityStates:     ReadonlyMap<string, EntityVisualState>;
  readonly selectedEntityId: string | null;
  readonly reducedMotion:    boolean;
  readonly onHover:          (hit: PickHit | null) => void;
  readonly onSelect:         (entityId: string | null) => void;
  readonly onTickUpdate:     (tick: ((t: number) => void) | null) => void;
}

const HOVER_OPACITY = 0.3;
const SELECT_OPACITY = 0.5;

/** Hover glow, click selection and camera glide for monsters. Renders nothing. */
export function DungeonInteraction({
  rig, batches, rooms, positions, entityStates, selectedEntityId,
  reducedMotion, onHover, onSelect, onTickUpdate,
}: Props) {
  const statesRef = useRef(entityStates);
  statesRef.current = entityStates;
  const callbacksRef = useRef({ onHover, onSelect });
  callbacksRef.current = { onHover, onSelect };
  const selectGlowRef = useRef<MonsterGlow | null>(null);

  // --- Hover glow + picking ---
  useEffect(() => {
    const hoverGlow = createMonsterGlow(rig.scene, PALETTE.violet, HOVER_OPACITY);
    const picker = createMonsterPicker({
      dom: rig.dom,
      camera: rig.camera,
      batches,
      isPickable: (id) => statesRef.current.get(id) !== "PURIFIED",
      onHover: (hit) => {
        const spot = hit === null ? null : locateInstance(batches, hit.entityId);
        if (spot === null) hoverGlow.hide();
        else hoverGlow.show(spot);
        callbacksRef.current.onHover(hit);
      },
      onSelect: (id) => callbacksRef.current.onSelect(id),
    });
    return () => {
      picker.dispose();
      hoverGlow.dispose();
    };
  }, [rig, batches]);

  // --- Camera glide + selection pulse (one tick on the shared render loop) ---
  const glideRef = useRef<CameraGlide | null>(null);
  useEffect(() => {
    const selectGlow = createMonsterGlow(rig.scene, PALETTE.gold, SELECT_OPACITY);
    const glide = createCameraGlide(rig.camera, rig.controls, reducedMotion, positions, roomReach(rooms));
    selectGlowRef.current = selectGlow;
    glideRef.current = glide;
    onTickUpdate((t) => {
      glide.tick(t);
      selectGlow.pulse(t);
    });
    return () => {
      onTickUpdate(null);
      selectGlowRef.current = null;
      glideRef.current = null;
      glide.dispose();
      selectGlow.dispose();
    };
  }, [rig, reducedMotion, positions, rooms, onTickUpdate]);

  // --- Selected monster: halo, and glide to its room ---
  useEffect(() => {
    const spot = selectedEntityId === null ? null : locateInstance(batches, selectedEntityId);
    const selectable = spot !== null && entityStates.get(selectedEntityId ?? "") !== "PURIFIED";
    if (selectable) selectGlowRef.current?.show(spot);
    else selectGlowRef.current?.hide();
  }, [batches, selectedEntityId, entityStates]);

  useEffect(() => {
    if (selectedEntityId === null) return;
    const target = roomFocusTarget(rooms, positions, selectedEntityId);
    if (target !== null) glideRef.current?.focus(target);
  }, [selectedEntityId, rooms, positions]);

  // --- Selection cleared (Escape or empty-space click): glide back to the whole dungeon ---
  const hadSelectionRef = useRef(false);
  useEffect(() => {
    if (selectedEntityId === null && hadSelectionRef.current) glideRef.current?.reset();
    hadSelectionRef.current = selectedEntityId !== null;
  }, [selectedEntityId]);

  return null;
}
