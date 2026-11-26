import { useEffect } from "react";
import * as THREE from "three";
import type { CityNode } from "../../adapter.ts";
import { buildingHeight, buildingWidth } from "../../layout/buildingScale.ts";
// --- Constants ---
const HOVER_COLOR     = 0x9fb3c8;
const SELECTED_COLOR  = 0xffffff;
const HOVER_MARGIN    = 1.08;
const SELECTED_MARGIN = 1.2;
interface Props {
  readonly nodes: readonly CityNode[];
  readonly positions: Map<string, THREE.Vector3>;
  readonly scene: THREE.Scene;
  readonly hoveredId: string | null;
  readonly selectedId: string | null;
}
/** Draws a static outline around the hovered building and a larger, brighter one around the selected building. */
export function BuildingHighlights({ nodes, positions, scene, hoveredId, selectedId }: Props) {
  useEffect(() => {
    const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const disposables: { dispose: () => void }[] = [box];
    const outline = (id: string | null, color: number, margin: number): THREE.LineSegments | null => {
      const node = nodes.find((n) => n.id === id);
      const pos  = positions.get(id ?? "");
      if (node == null || pos == null) return null;
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      disposables.push(material);
      const height = buildingHeight(node.complexity);
      const width  = buildingWidth(node.complexity) * margin;
      const lines  = new THREE.LineSegments(box, material);
      lines.position.set(pos.x, height / 2, pos.z);
      lines.scale.set(width, height * margin, width);
      scene.add(lines);
      return lines;
    };
    const added = [
      outline(hoveredId, HOVER_COLOR, HOVER_MARGIN),
      outline(selectedId, SELECTED_COLOR, SELECTED_MARGIN),
    ];
    return () => {
      added.forEach((o) => { if (o != null) scene.remove(o); });
      disposables.forEach((d) => d.dispose());
    };
  }, [nodes, positions, scene, hoveredId, selectedId]);
  return null;
}
