import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { CityView, Tick } from "../../hooks/useCityRenderer.ts";
import { pickNodeId } from "./pickNode.ts";
// --- Constants ---
const CLICK_MOVE_PX = 4; // larger pointer travel between down and up counts as an orbit drag
const TICK_ID = "picking";
// --- Types ---
export interface PickHit {
  readonly id: string;
  /** Pointer position in pixels relative to the canvas. */
  readonly x: number;
  readonly y: number;
}
interface Options {
  readonly canvas: HTMLCanvasElement | null;
  readonly view: CityView | null;
  readonly registerTick: (id: string, tick: Tick | null) => void;
  readonly onHover: (hit: PickHit | null) => void;
  readonly onSelect: (id: string) => void;
}
// --- Hook ---
/** Hover (raycast once per frame in the shared Render_Loop) and click picking on the canvas. */
export function useBuildingPicking({ canvas, view, registerTick, onHover, onSelect }: Options): void {
  const callbacks = useRef({ onHover, onSelect });
  callbacks.current = { onHover, onSelect };
  useEffect(() => {
    if (canvas == null || view == null) return;
    const raycaster = new THREE.Raycaster();
    const ndc       = new THREE.Vector2();
    let pending: { x: number; y: number } | null = null;
    let down: { x: number; y: number } | null = null;
    let lastId: string | null = null;
    const pick = (x: number, y: number): string | null => {
      ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
      return pickNodeId(raycaster, view.scene, view.camera, ndc);
    };
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove  = (e: PointerEvent) => { pending = local(e); };
    const onLeave = () => {
      pending = null;
      lastId  = null;
      callbacks.current.onHover(null);
    };
    const onDown = (e: PointerEvent) => { down = local(e); };
    const onUp   = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (start == null) return;
      const end = local(e);
      if (Math.hypot(end.x - start.x, end.y - start.y) > CLICK_MOVE_PX) return;
      const id = pick(end.x, end.y);
      if (id != null) callbacks.current.onSelect(id);
    };
    registerTick(TICK_ID, () => {
      if (pending == null) return;
      const { x, y } = pending;
      pending = null;
      const id = pick(x, y);
      if (id == null) {
        if (lastId != null) callbacks.current.onHover(null);
      } else {
        callbacks.current.onHover({ id, x, y });
      }
      lastId = id;
    });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      registerTick(TICK_ID, null);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [canvas, view, registerTick]);
}
