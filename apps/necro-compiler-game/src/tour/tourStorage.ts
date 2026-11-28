const SEEN_KEY = "morpheus-tour-seen-necro";

export function hasSeenTour(_appKey: "necro" | "infra" = "necro"): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourSeen(_appKey: "necro" | "infra" = "necro"): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // storage unavailable: tour still works, just not persisted
  }
}
