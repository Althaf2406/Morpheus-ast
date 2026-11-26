import { useCallback, useRef, type MutableRefObject } from "react";

type Tick = (t: number) => void;
type TickSetter = (tick: Tick | null) => void;

export interface TickRegistry {
  readonly ticksRef:         MutableRefObject<Map<string, Tick>>;
  readonly handleRoomTick:   TickSetter;
  readonly handleEntityTick: TickSetter;
  readonly handleOverlayTick: TickSetter;
}

/** Per-frame tick registry: layers register a callback, the render loop runs them all. */
export function useTickRegistry(): TickRegistry {
  const ticksRef = useRef<Map<string, Tick>>(new Map());

  const registerTick = useCallback((id: string, fn: Tick | null) => {
    if (fn == null) ticksRef.current.delete(id);
    else            ticksRef.current.set(id, fn);
  }, []);

  const handleRoomTick = useCallback(
    (tick: Tick | null) => registerTick("dungeon-rooms", tick),
    [registerTick]
  );
  const handleEntityTick = useCallback(
    (tick: Tick | null) => registerTick("dungeon-entities", tick),
    [registerTick]
  );
  const handleOverlayTick = useCallback(
    (tick: Tick | null) => registerTick("dungeon-overlay", tick),
    [registerTick]
  );
  return { ticksRef, handleRoomTick, handleEntityTick, handleOverlayTick };
}
