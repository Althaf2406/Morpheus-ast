import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./tour.css";
import type { TourState } from "./tourState";
import { TOUR_STEPS } from "./tourSteps";
import { useTargetRect } from "./useTargetRect";
import type { TargetRect } from "./useTargetRect";
import { placeCard } from "./placement";
import { paletteStyle } from "../hud/palette";

interface Props {
  readonly state: TourState;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
}

const CARD_WIDTH = 340;
const CARD_HEIGHT_ESTIMATE = 190;
function spotlightStyle(r: TargetRect): CSSProperties {
  return { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 };
}
/** Portal-rendered tour: spotlight + anchored card, or a centered card when no target is on screen. */
export function TourOverlay({ state, onNext, onBack, onSkip }: Props) {
  const step = TOUR_STEPS[state.step - 1];
  const rect = useTargetRect(step.targetSelector, state.visible);
  const nextRef = useRef<HTMLButtonElement>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(CARD_HEIGHT_ESTIMATE);
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight ?? 0;
    if (h > 0 && h !== cardHeight) setCardHeight(h);
  });
  useEffect(() => {
    if (state.visible) nextRef.current?.focus();
  }, [state.visible, state.step]);

  if (!state.visible) return null;

  const titleId = "tour-card-title";
  const isLast = state.step === 3;
  const placement = placeCard(
    rect,
    { width: window.innerWidth, height: window.innerHeight },
    { width: CARD_WIDTH, height: cardHeight },
  );
  const cardClass = placement.centered ? "tour-card tour-card--centered" : "tour-card";
  return createPortal(
    <div className="tour-overlay" style={paletteStyle}>
      {rect !== null && !placement.centered && <div className="tour-spotlight" data-testid="tour-spotlight" style={spotlightStyle(rect)} />}
      {placement.centered && <div className="tour-dim" data-testid="tour-dim" />}
      <div
        ref={cardRef}
        className={cardClass}
        role="dialog"
        aria-labelledby={titleId}
        style={{ left: placement.left, top: placement.top }}
      >
        <p className="tour-card__step">{state.step} / 3</p>
        <h2 id={titleId} className="tour-card__title">{step.title}</h2>
        <p className="tour-card__text">{step.text}</p>
        <div className="tour-card__actions">
          <button type="button" className="tour-btn tour-btn--ghost" onClick={onSkip}>Skip</button>
          <span className="tour-card__spacer" />
          <button type="button" className="tour-btn" onClick={onBack} disabled={state.step === 1}>Back</button>
          <button type="button" className="tour-btn tour-btn--primary" onClick={onNext} ref={nextRef}>
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
