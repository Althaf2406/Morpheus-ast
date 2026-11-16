import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CyberCityLayout } from "../../adapter.ts";
import { useCityPositions } from "../../hooks/useCityPositions.ts";
import { CityNodes } from "./CityNodes.tsx";
import { CityEdges } from "./CityEdges.tsx";

interface Props {
  readonly layout: CyberCityLayout;
}

export function CyberCityScene({ layout }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [clock]  = useState(() => new THREE.Clock());
  const positions = useCityPositions(layout.nodes);

  // Detect reduced motion preference once
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setClearColor(0x0a0e14);

    // --- Scene ---
    const threeScene = new THREE.Scene();
    threeScene.fog = new THREE.FogExp2(0x0a0e14, 0.018);

    // --- Lights ---
    const ambient = new THREE.AmbientLight(0x1a2a4a, 0.6);
    const dirLight = new THREE.DirectionalLight(0xc0d8ff, 1.2);
    dirLight.position.set(0, 20, 10);
    threeScene.add(ambient, dirLight);

    // --- Camera ---
    const camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 20, 28);
    camera.lookAt(0, 0, 0);

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.target.set(0, 2, 0);
    controls.update();

    setScene(threeScene);
    clock.start();

    // --- rAF loop ---
    let rafId: number;
    const render = () => {
      rafId = requestAnimationFrame(render);
      controls.update();
      renderer.render(threeScene, camera);
    };
    rafId = requestAnimationFrame(render);

    // --- Resize handler ---
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
            clock={clock}
            reducedMotion={reducedMotion}
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
