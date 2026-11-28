import "./tour.css";
import { MuteToggle } from "../audio";
import { paletteStyle } from "../hud/palette";
import { HubLink } from "./HubLink";
import { ReplayButton } from "./ReplayButton";
import { SwitchWorldLink } from "./SwitchWorldLink";
import { TourOverlay } from "./TourOverlay";
import { useTour } from "./useTour";

interface Props {
  readonly hasRepoParam: boolean;
  readonly loadSummaryOpen: boolean;
}

/** Tour overlay plus the small fixed corner cluster: replay, switch world, hub. */
export function TourChrome({ hasRepoParam, loadSummaryOpen }: Props) {
  const tour = useTour("necro", { hasRepoParam, loadSummaryOpen });
  return (
    <>
      <TourOverlay state={tour.state} onNext={tour.next} onBack={tour.back} onSkip={tour.skip} />
      <div className="tour-corner" style={paletteStyle}>
        <ReplayButton onClick={tour.replay} />
        <MuteToggle />
        <SwitchWorldLink />
        <HubLink />
      </div>
    </>
  );
}
