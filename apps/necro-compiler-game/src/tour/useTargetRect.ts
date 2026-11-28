import { useEffect, useState } from "react";

export interface TargetRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Returns the target's rect when it exists and intersects the viewport, else null. */
export function measureTarget(selector: string): TargetRect | null {
  const el = document.querySelector(selector);
  if (el === null) return null;
  const r = el.getBoundingClientRect();
  const onScreen =
    r.width > 0 && r.height > 0 &&
    r.bottom > 0 && r.right > 0 &&
    r.top < window.innerHeight && r.left < window.innerWidth;
  return onScreen ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

/** Tracks a target's on-screen rect, re-measuring on resize and scroll. */
export function useTargetRect(selector: string, active: boolean): TargetRect | null {
  const [rect, setRect] = useState<TargetRect | null>(null);
  useEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }
    const update = (): void => setRect(measureTarget(selector));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector, active]);
  return rect;
}
