import {
  playEnvelopedOscillator,
  playFilteredNoiseBurst,
  playNoiseSweep,
} from "./voices";

export { buildDroneAmbience } from "./ambience";

// Effect recipes: each schedules one short sound (<= 2 s) on `destination`
export type EffectBuilder = (context: AudioContext, destination: AudioNode) => void;

const BELL_RATIOS: readonly number[] = [1, 2.76, 5.4];

// Select: soft low whisper plus thud
export const buildWhisperEffect: EffectBuilder = (context, destination) => {
  playEnvelopedOscillator(context, destination, {
    freq: 90, endFreq: 55, type: "sine",
    attackSeconds: 0.01, releaseSeconds: 0.15, durationSeconds: 0.25, peakGain: 0.3,
  });
  playFilteredNoiseBurst(context, destination, {
    cutoff: 700, endCutoff: 200,
    attackSeconds: 0.05, releaseSeconds: 0.2, durationSeconds: 0.35, peakGain: 0.08,
  });
};

function bellPartials(
  context: AudioContext,
  destination: AudioNode,
  base: number,
  endBase: number,
  peakGain: number,
): void {
  BELL_RATIOS.forEach((ratio, index) => {
    playEnvelopedOscillator(context, destination, {
      freq: base * ratio, endFreq: endBase * ratio, type: "sine",
      attackSeconds: 0.02, releaseSeconds: 0.5, durationSeconds: 0.9,
      peakGain: peakGain / (index + 1), startOffset: index * 0.04,
    });
  });
}

// Cast: rising shimmer, noise sweep plus bell partials
export const buildShimmerRise: EffectBuilder = (context, destination) => {
  playNoiseSweep(context, destination, {
    cutoff: 300, endCutoff: 5000, q: 4,
    attackSeconds: 0.05, releaseSeconds: 0.25, durationSeconds: 0.8, peakGain: 0.15,
  });
  bellPartials(context, destination, 660, 990, 0.18);
};

// Undo: the same shimmer reversed, falling
export const buildReverseShimmer: EffectBuilder = (context, destination) => {
  playNoiseSweep(context, destination, {
    cutoff: 5000, endCutoff: 300, q: 4,
    attackSeconds: 0.05, releaseSeconds: 0.25, durationSeconds: 0.8, peakGain: 0.15,
  });
  bellPartials(context, destination, 990, 495, 0.18);
};

// Purify: two clean rising chime notes
export const buildPurifyChime: EffectBuilder = (context, destination) => {
  [880, 1318.5].forEach((freq, index) => {
    playEnvelopedOscillator(context, destination, {
      freq, type: "sine",
      attackSeconds: 0.01, releaseSeconds: 0.7, durationSeconds: 1.0,
      peakGain: 0.22, startOffset: index * 0.12,
    });
  });
};

// Denied: dull short thump
export const buildDeniedThump: EffectBuilder = (context, destination) => {
  playEnvelopedOscillator(context, destination, {
    freq: 80, endFreq: 40, type: "triangle",
    attackSeconds: 0.005, releaseSeconds: 0.12, durationSeconds: 0.2, peakGain: 0.4,
  });
  playFilteredNoiseBurst(context, destination, {
    cutoff: 250,
    attackSeconds: 0.005, releaseSeconds: 0.08, durationSeconds: 0.12, peakGain: 0.12,
  });
};

// Load complete: deep gong, inharmonic low partials with a long release
export const buildGong: EffectBuilder = (context, destination) => {
  [65, 97.5, 163, 241].forEach((freq, index) => {
    playEnvelopedOscillator(context, destination, {
      freq, type: index === 0 ? "sine" : "triangle",
      attackSeconds: 0.01, releaseSeconds: 1.6, durationSeconds: 2,
      peakGain: 0.3 / (index + 1),
    });
  });
};
