import { useMemo, useState } from "react";
import type { CyberCityLayout } from "../../adapter.ts";
import { useCityPositions } from "../../hooks/useCityPositions.ts";
import { useCityRenderer } from "../../hooks/useCityRenderer.ts";
import { frameCamera } from "../../layout/frameCamera.ts";
import { CityNodes } from "./CityNodes.tsx";
import { CityEdges } from "./CityEdges.tsx";
import { FaultOverlay } from "./FaultOverlay.tsx";
import { BuildingHighlights } from "./BuildingHighlights.tsx";
import { BuildingTooltip } from "./BuildingTooltip.tsx";
import { useBuildingPicking } from "./useBuildingPicking.ts";
import type { PickHit } from "./useBuildingPicking.ts";

interface Props {
  readonly layout: CyberCityLayout;
  readonly selectedId?: string | null;
  readonly onHover?: (id: string | null) => void;
  readonly onSelect?: (id: string) => void;
}

export function CyberCityScene({ layout, selectedId = null, onHover, onSelect }: Props) {
  const positions = useCityPositions(layout.nodes, layout.edges);
  const frame     = useMemo(() => frameCamera(positions), [positions]);
  const { canvasRef, view, registerTick } = useCityRenderer(frame);

  // --- Reduced motion (read once per mount) ---
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // --- Hover and selection picking ---
  const [hit, setHit] = useState<PickHit | null>(null);
  const hovered = hit == null ? undefined : layout.nodes.find((n) => n.id === hit.id);
  useBuildingPicking({
    canvas: canvasRef.current,
    view,
    registerTick,
    onHover: (h) => { setHit(h); onHover?.(h?.id ?? null); },
    onSelect: (id) => onSelect?.(id),
  });
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      {view != null && (
        <>
          <CityNodes nodes={layout.nodes} positions={positions} scene={view.scene} />
          <CityEdges
            edges={layout.edges}
            nodes={layout.nodes}
            positions={positions}
            scene={view.scene}
          />
          <FaultOverlay
            nodes={layout.nodes}
            edges={layout.edges}
            positions={positions}
            scene={view.scene}
            reducedMotion={reducedMotion}
            registerTick={registerTick}
          />
          <BuildingHighlights
            nodes={layout.nodes}
            positions={positions}
            scene={view.scene}
            hoveredId={hovered?.id ?? null}
            selectedId={selectedId}
          />
        </>
      )}
      {hit != null && hovered != null && <BuildingTooltip node={hovered} x={hit.x} y={hit.y} />}
    </div>
  );
}
