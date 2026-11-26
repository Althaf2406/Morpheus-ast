/** Visual life-cycle of one entity. TASK-NC-07 only has to change this map. */
export type EntityVisualState = "ALIVE" | "DYING" | "PURIFIED";

export interface VisualProgress {
  /** 0 = intact, 1 = fully dissolved into a faint husk. */
  readonly dissolve: number;
  /** 0 = untouched, 1 = gleam finished and entity gone. */
  readonly purify: number;
}

export interface PhaseTrack {
  readonly phase: EntityVisualState;
  /** Clock time (seconds) at which the phase was first seen. */
  readonly since: number;
}

// --- Constants ---

export const DYING_SECONDS = 1.2;
export const PURIFY_SECONDS = 1.6;
/** Time for an undone monster to fade back in from its husk. */
export const REVIVE_SECONDS = 1.0;
/** Dissolve level shown (held) when motion is reduced and the entity is dying. */
export const REDUCED_DYING_DISSOLVE = 0.6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// --- Pure progress ---

/**
 * Progress of the visual transition `elapsed` seconds after the phase began.
 * Monotone non-decreasing in `elapsed`; both outputs stay in [0, 1].
 * With reduced motion the end pose is shown at once, with no animation.
 */
export function transitionProgress(
  phase: EntityVisualState,
  elapsed: number,
  reducedMotion: boolean
): VisualProgress {
  switch (phase) {
    case "ALIVE":
      return { dissolve: 0, purify: 0 };
    case "DYING":
      return {
        dissolve: reducedMotion ? REDUCED_DYING_DISSOLVE : clamp01(elapsed / DYING_SECONDS),
        purify: 0,
      };
    case "PURIFIED":
      return { dissolve: 1, purify: reducedMotion ? 1 : clamp01(elapsed / PURIFY_SECONDS) };
  }
}

/** Keeps the track while the phase is unchanged; restarts it at `now` on a change. */
export function advanceTrack(
  track: PhaseTrack | undefined,
  desired: EntityVisualState,
  now: number
): PhaseTrack {
  return track !== undefined && track.phase === desired ? track : { phase: desired, since: now };
}

/** Reverse transition after an undo: the husk fades back to a living monster. */
export function reviveProgress(elapsed: number, reducedMotion: boolean): VisualProgress {
  return { dissolve: reducedMotion ? 0 : 1 - clamp01(elapsed / REVIVE_SECONDS), purify: 0 };
}
