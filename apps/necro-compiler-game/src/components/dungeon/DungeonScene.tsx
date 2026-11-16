import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { DungeonLayout } from "../../adapter.ts";
import { frameCamera } from "../../layout/frameCamera.ts";
import { createDungeonLighting } from "./dungeonLighting.ts";
import { useDungeonPositions } from "./useDungeonPositions.ts";
import { DungeonRooms } from "./DungeonRooms.tsx";
import { DungeonCorridors } from "./DungeonCorridors.tsx";

interface Props {
  readonly layout: DungeonLayout;
}

export function DungeonScene({ layout }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [clock]           = useState(() => new THREE.Clock());
  const positions         = useDungeonPositions(layout.rooms, layout.corridors);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ticksRef = useRef<Map<string, (t: number) => void>>(new Map());

  const registerTick = useCallback((id: string, fn: ((t: number) => void) | null) => {
    if (fn == null) ticksRef.current.delete(id);
    else            ticksRef.current.set(id, fn);
  }, []);

  const handleRoomTick = useCallback(
    (tick: ((t: number) => void) | null) => registerTick("dungeon-rooms", tick),
    [registerTick]
  );

  // --- Renderer + scene setup (runs once) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x0d0a08);

    // Compute camera frame first — fog near/far depend on camDist.
    const frame = frameCamera(positions);

    const threeScene = new THREE.Scene();
    // Linear fog scaled to camera distance: near = camDist×0.8, far = camDist×3.
    // This ensures the entire dungeon is always legible and only the far
    // background fades, regardless of how compact or spread the layout is.
    const fogNear = frame.camDist * 0.8;
    const fogFar  = frame.camDist * 3;
    threeScene.fog = new THREE.Fog(0x0d0a08, fogNear, fogFar);

    const lighting = createDungeonLighting(threeScene);

    // Auto-frame: position camera to show all rooms on first load
    const cam = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      2000
    );
    cam.position.copy(frame.position);
    cam.lookAt(frame.target);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance   = 5;
    controls.maxDistance   = frame.maxDistance;
    controls.target.copy(frame.target);
    controls.update();

    setScene(threeScene);
    clock.start();

    let rafId: number;
    const render = () => {
      rafId = requestAnimationFrame(render);
      if (!reducedMotion) {
        const t = clock.getElapsedTime();
        ticksRef.current.forEach((tick) => tick(t));
      }
      controls.update();
      renderer.render(threeScene, cam);
    };
    rafId = requestAnimationFrame(render);

    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      lighting.dispose();
      controls.dispose();
      renderer.dispose();
      setScene(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {scene != null && (
        <>
          <DungeonRooms
            rooms={layout.rooms}
            positions={positions}
            scene={scene}
            onTickUpdate={handleRoomTick}
          />
          <DungeonCorridors
            corridors={layout.corridors}
            rooms={layout.rooms}
            positions={positions}
            scene={scene}
          />
        </>
      )}
    </div>
  );
}
