import type { SREDashboardData } from "../../adapter";

// --- Types ---

type Patch = NonNullable<SREDashboardData["lastPatch"]>;

export interface PatchLabel {
  readonly text: string;
  readonly isDeterministic: boolean;
}

// --- Constants ---

const DETERMINISTIC_MODEL_ID = "deterministic";
const DETERMINISTIC_TEXT = "DETERMINISTIC PATCH (rule-based, no AI)";

// --- Label ---

export function patchLabel(patch: Pick<Patch, "modelId">): PatchLabel {
  if (patch.modelId === DETERMINISTIC_MODEL_ID) {
    return { text: DETERMINISTIC_TEXT, isDeterministic: true };
  }
  return { text: `AI PATCH (${patch.modelId})`, isDeterministic: false };
}
