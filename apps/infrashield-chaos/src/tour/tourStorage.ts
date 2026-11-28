// The only module that touches localStorage. Every access is guarded.
export type TourAppKey = "necro" | "infra";

const KEY_PREFIX = "morpheus-tour-seen-";

function keyFor(appKey: TourAppKey): string {
  return KEY_PREFIX + appKey;
}

export function hasSeenTour(appKey: TourAppKey = "infra"): boolean {
  try {
    return window.localStorage.getItem(keyFor(appKey)) !== null;
  } catch {
    return false;
  }
}

export function markTourSeen(appKey: TourAppKey = "infra"): void {
  try {
    window.localStorage.setItem(keyFor(appKey), "1");
  } catch {
    // Storage unavailable or full: continue without persistence.
  }
}
