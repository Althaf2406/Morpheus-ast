import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS } from "./tourSteps.ts";
import type { TourState } from "./tourState.ts";
import "./tour.css";

// --- Types ---
interface Props {
  readonly state: TourState;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onSkip: () => void;
}

interface Box { readonly top: number; readonly left: number; readonly width: number; readonly height: number }

const PAD = 6;
const CARD_W = 320;
const CARD_H = 200;

// --- Target lookup ---
/** Bounding box of the target when it exists and intersects the viewport, else null. */
function measure(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  const onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0
    && r.top < window.innerHeight && r.left < window.innerWidth;
  return onScreen ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

function spotlightStyle(b: Box): CSSProperties {
  return { top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2 };
}

/** Places the card beside the spotlight, below when there is room, otherwise above. */
function anchoredStyle(b: Box): CSSProperties {
  const left = Math.max(8, Math.min(b.left, window.innerWidth - CARD_W - 8));
  if (b.top + b.height + PAD + CARD_H < window.innerHeight) return { left, top: b.top + b.height + PAD + 12 };
  return { left, bottom: Math.max(8, window.innerHeight - b.top + PAD + 12) };
}

// --- Component ---
/** Portal overlay: Spotlight plus anchored card, or a Centered_Card when the target is missing. */
export function TourOverlay({ state, onNext, onBack, onSkip }: Props) {
  const step = TOUR_STEPS[state.step - 1];
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (!state.visible) return;
    const update = () => setBox(measure(step.targetSelector));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [state.visible, step.targetSelector]);

  useEffect(() => {
    if (state.visible) document.getElementById("tour-next")?.focus();
  }, [state.visible, state.step]);

  if (!state.visible) return null;
  const cardStyle = box === null ? undefined : anchoredStyle(box);
  return createPortal(
    <div className="tour-root">
      {box !== null && <div className="tour-spotlight" data-testid="tour-spotlight" style={spotlightStyle(box)} />}
      <div
        className={box === null ? "tour-card tour-card-centered" : "tour-card"}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        style={cardStyle}
      >
        <div className="tour-indicator">{state.step} / 3</div>
        <h2 className="tour-title">{step.title}</h2>
        <p className="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button type="button" className="tour-btn tour-skip" onClick={onSkip}>Skip</button>
          {state.step > 1 && <button type="button" className="tour-btn" onClick={onBack}>Back</button>}
          <button id="tour-next" type="button" className="tour-btn tour-primary" onClick={onNext}>
            {state.step === 3 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
