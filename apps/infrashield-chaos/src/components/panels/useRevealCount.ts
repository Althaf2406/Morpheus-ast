import { useEffect, useState } from "react";
// --- Constants ---
const CHARS_PER_TICK = 4;
const INTERVAL_MS = Math.round(1000 / 30);
// --- Helpers ---
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
// --- Hook ---
/**
 * Number of characters revealed so far by a typing effect over `total` characters.
 * Restarts when `resetKey` changes; returns `total` at once under prefers-reduced-motion.
 */
export function useRevealCount(total: number, resetKey: string): number {
  const [instant] = useState(prefersReducedMotion);
  const [state, setState] = useState({ key: resetKey, count: 0 });
  useEffect(() => {
    if (instant) return;
    setState({ key: resetKey, count: 0 });
    let count = 0;
    const id = setInterval(() => {
      count = Math.min(count + CHARS_PER_TICK, total);
      setState({ key: resetKey, count });
      if (count >= total) clearInterval(id);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [instant, resetKey, total]);
  if (instant) return total;
  // A stale key means the reset above has not rendered yet.
  return state.key === resetKey ? Math.min(state.count, total) : 0;
}
