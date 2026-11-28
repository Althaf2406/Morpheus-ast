// --- InfraShield sound recipes, composed from voices.ts primitives ---

import {
  playEnvelopedOscillator,
  playFilteredNoiseBurst,
  type VoiceTarget,
} from "./voices";

const HUM_HZ = 55;
const HUM_GAIN = 0.06;
const FADE_SECONDS = 0.5;
const STOP_FADE_SECONDS = 0.03;
const NOISE_LOOP_SECONDS = 2;

// --- Ambience: server hum (sine 50-60 Hz plus quiet filtered noise) ---

export function buildServerHumAmbience(target: VoiceTarget): () => void {
  const { context, destination } = target;
  const now = context.currentTime;
  const bus = context.createGain();
  bus.gain.setValueAtTime(0, now);
  bus.gain.linearRampToValueAtTime(HUM_GAIN, now + FADE_SECONDS);
  bus.connect(destination);

  const hum = context.createOscillator();
  hum.type = "sine";
  hum.frequency.setValueAtTime(HUM_HZ, now);
  hum.connect(bus);

  const length = Math.max(1, Math.floor(context.sampleRate * NOISE_LOOP_SECONDS));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const hiss = context.createBufferSource();
  hiss.buffer = buffer;
  hiss.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(400, now);
  const hissGain = context.createGain();
  hissGain.gain.setValueAtTime(0.3, now);
  hiss.connect(filter);
  filter.connect(hissGain);
  hissGain.connect(bus);

  const sources: AudioScheduledSourceNode[] = [hum, hiss];
  for (const source of sources) {
    target.track?.(source);
    source.start(now);
  }

  return () => {
    const end = context.currentTime + STOP_FADE_SECONDS;
    bus.gain.cancelScheduledValues(context.currentTime);
    bus.gain.linearRampToValueAtTime(0, end);
    for (const source of sources) {
      try {
        source.stop(end);
      } catch {
        // Already stopped.
      }
      source.onended = () => {
        source.disconnect();
        if (source === hiss) {
          filter.disconnect();
          hissGain.disconnect();
          bus.disconnect();
        }
      };
    }
  };
}

// --- Effects ---

const ALARM_TONES = [880, 660, 880] as const;
const ALARM_PULSE_STEP = 0.18;

export function buildAlarmEffect(target: VoiceTarget): void {
  ALARM_TONES.forEach((freq, i) => {
    playEnvelopedOscillator(target, {
      freq,
      type: "square",
      startOffset: i * ALARM_PULSE_STEP,
      attack: 0.01,
      duration: 0.14,
      gain: 0.12,
    });
  });
  const impactAt = ALARM_TONES.length * ALARM_PULSE_STEP + 0.05;
  playEnvelopedOscillator(target, {
    freq: 50,
    startOffset: impactAt,
    attack: 0.01,
    duration: 0.7,
    gain: 0.4,
  });
  playFilteredNoiseBurst(target, {
    cutoff: 300,
    startOffset: impactAt,
    attack: 0.005,
    duration: 0.3,
    gain: 0.3,
  });
}

export function buildCascadeTick(target: VoiceTarget): void {
  playEnvelopedOscillator(target, { freq: 1200, attack: 0.002, duration: 0.05, gain: 0.1 });
}

function twoNotes(target: VoiceTarget, first: number, second: number): void {
  playEnvelopedOscillator(target, { freq: first, attack: 0.01, duration: 0.18, gain: 0.2 });
  playEnvelopedOscillator(target, { freq: second, startOffset: 0.15, attack: 0.01, duration: 0.3, gain: 0.2 });
}

export function buildPatchAppliedEffect(target: VoiceTarget): void {
  twoNotes(target, 440, 660);
}

export function buildPatchRollbackEffect(target: VoiceTarget): void {
  twoNotes(target, 660, 440);
}

const CLICK_OFFSETS = [0, 0.05, 0.09, 0.16, 0.21, 0.27] as const;

export function buildBugfixClickEffect(target: VoiceTarget): void {
  for (const startOffset of CLICK_OFFSETS) {
    playFilteredNoiseBurst(target, { cutoff: 5000, startOffset, attack: 0.002, duration: 0.03, gain: 0.25 });
  }
}

export function buildLoadCompleteChime(target: VoiceTarget): void {
  playEnvelopedOscillator(target, { freq: 880, attack: 0.01, duration: 0.7, gain: 0.15 });
  playEnvelopedOscillator(target, { freq: 1320, startOffset: 0.08, attack: 0.01, duration: 0.6, gain: 0.1 });
}
