import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CyberCityLayout } from "../../adapter.ts";
import { useCityPositions } from "../../hooks/useCityPositions.ts";
import { buildFaultAnimation } from "./useFaultAnimation.ts";
import { CityNodes } from "./CityNodes.tsx";
import { CityEdges } from "./CityEdges.tsx";

interface Props {
  readonly layout: CyberCityLayout;
}

export function CyberCityScene({ layout }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [scene, setScene]  = useState<THREE.Scene | null>(null);
  const [clock]            = useState(() => new THREE.Clock());
  const positions          = useCityPositions(layout.nodes);

  // Detect reduced motion preference once
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Single tick-callback registry — keyed by string id
  const ticksRef = useRef<Map<string, (t: number) => void>>(new Map());

  const registerTick = useCallback((id: string, fn: ((t: number) => void) | null) => {
    if (fn == null) {
      ticksRef.current.delete(id);
    } else {
      ticksRef.current.set(id, fn);
    }
  }, []);

  // CityNodes tick bridge
  const handleNodeTick = useCallback(
    (tick: ((t: number) => void) | null) => registerTick("city-nodes", tick),
    [registerTick]
  );

  // --- Fault animation: build and register its tick whenever layout changes ---
  useEffect(() => {
    if (scene == null) return;
    const hasFault = layout.nodes.some((n) => n.isFaulted);
    if (!hasFault) {
      registerTick("fault-anim", null);
      return;
    }
    const handle = buildFaultAnimation({
      nodes: layout.nodes,
      edges: layout.edges,
      positions,
      scene,
      reducedMotion,
    });
    registerTick("fault-anim", handle.animateTick);
    return () => {
      registerTick("fault-anim", null);
      handle.dispose();
    };
  // positions map identity changes with nodes, so this re-runs correctly
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.nodes, layout.edges, positions, scene, reducedMotion]);

  // --- Renderer + scene setup (runs once) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x0a0e14);

    const threeScene = new THREE.Scene();
    threeScene.fog   = new THREE.FogExp2(0x0a0e14, 0.018);

    const ambient  = new THREE.AmbientLight(0x1a2a4a, 0.6);
    const dirLight = new THREE.DirectionalLight(0xc0d8ff, 1.2);
    dirLight.position.set(0, 20, 10);
    threeScene.add(ambient, dirLight);

    const camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 20, 28);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance   = 5;
    controls.maxDistance   = 80;
    controls.target.set(0, 2, 0);
    controls.update();

    setScene(threeScene);
    clock.start();

    // --- Single rAF loop ---
    let rafId: number;
    const render = () => {
      rafId = requestAnimationFrame(render);
      const t = clock.getElapsedTime();
      ticksRef.current.forEach((tick) => tick(t));
      controls.update();
      renderer.render(threeScene, camera);
    };
    rafId = requestAnimationFrame(render);

    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
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
          <CityNodes
            nodes={layout.nodes}
            positions={positions}
            scene={scene}
            onTickUpdate={handleNodeTick}
          />
          <CityEdges
            edges={layout.edges}
            nodes={layout.nodes}
            positions={positions}
            scene={scene}
          />
        </>
      )}
    </div>
  );
}
