import type { CSSProperties } from "react";
import { HubLink } from "./HubLink.tsx";
import { SwitchWorldLink } from "./SwitchWorldLink.tsx";
import { TourOverlay } from "./TourOverlay.tsx";
import type { UseTourResult } from "./useTour.ts";

// --- Styles ---
const LINKS: CSSProperties = {
  position: "absolute", bottom: 64, left: 16, display: "flex", gap: 8, zIndex: 5,
};

// --- Component ---
interface Props {
  readonly tour: UseTourResult;
}

/** Tour overlay plus the world-switch and hub links. */
export function TourChrome({ tour }: Props) {
  return (
    <>
      {tour.state.visible && (
        <TourOverlay state={tour.state} onNext={tour.next} onBack={tour.back} onSkip={tour.skip} />
      )}
      <nav aria-label="World navigation" style={LINKS}>
        <SwitchWorldLink />
        <HubLink />
      </nav>
    </>
  );
}
