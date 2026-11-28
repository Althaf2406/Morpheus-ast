// --- Low-level voice factories: enveloped oscillator, noise burst, noise sweep ---

export const MAX_VOICE_GAIN = 0.5;
export const MAX_EFFECT_SECONDS = 2;

export interface VoiceTarget {
  readonly context: AudioContext;
  /** Normally the engine's Master_Gain. */
  readonly destination: AudioNode;
  /** Optional registry so the engine can stop live sources on dispose. */
  readonly track?: (source: AudioScheduledSourceNode) => void;
}

export interface OscillatorSpec {
  readonly freq: number;
  readonly type?: OscillatorType;
  readonly startOffset?: number;
  readonly attack?: number;
  readonly duration: number;
  readonly gain: number;
}

export interface NoiseBurstSpec {
  readonly cutoff: number;
  readonly startOffset?: number;
  readonly attack?: number;
  readonly duration: number;
  readonly gain: number;
}

export interface NoiseSweepSpec {
  readonly fromFreq: number;
  readonly toFreq: number;
  readonly startOffset?: number;
  readonly attack?: number;
  readonly duration: number;
  readonly gain: number;
}

// --- Input clamping ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function timing(startOffset: number | undefined, attack: number | undefined, duration: number) {
  const start = clamp(startOffset ?? 0, 0, MAX_EFFECT_SECONDS);
  const total = clamp(duration, 0.01, Math.max(0.01, MAX_EFFECT_SECONDS - start));
  const attackTime = clamp(attack ?? 0.01, 0.001, total / 2);
  return { start, total, attackTime };
}

// --- Shared envelope + lifecycle ---

function envelopeGain(
  target: VoiceTarget,
  at: number,
  attack: number,
  total: number,
  peak: number,
): GainNode {
  const gain = target.context.createGain();
  const level = clamp(peak, 0, MAX_VOICE_GAIN);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  gain.gain.linearRampToValueAtTime(0, at + total);
  gain.connect(target.destination);
  return gain;
}

function release(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  source.onended = () => {
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

function noiseSource(context: AudioContext, seconds: number): AudioBufferSourceNode {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  return source;
}

// --- Factories ---

export function playEnvelopedOscillator(target: VoiceTarget, spec: OscillatorSpec): OscillatorNode {
  const { context } = target;
  const { start, total, attackTime } = timing(spec.startOffset, spec.attack, spec.duration);
  const at = context.currentTime + start;
  const osc = context.createOscillator();
  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(clamp(spec.freq, 1, 20000), at);
  const gain = envelopeGain(target, at, attackTime, total, spec.gain);
  osc.connect(gain);
  release(osc, gain);
  target.track?.(osc);
  osc.start(at);
  osc.stop(at + total);
  return osc;
}

type Timed = Pick<NoiseBurstSpec, "startOffset" | "attack" | "duration" | "gain">;

function playFilteredNoise(
  target: VoiceTarget,
  spec: Timed,
  type: BiquadFilterType,
  tune: (freq: AudioParam, at: number, total: number) => void,
): AudioBufferSourceNode {
  const { context } = target;
  const { start, total, attackTime } = timing(spec.startOffset, spec.attack, spec.duration);
  const at = context.currentTime + start;
  const source = noiseSource(context, total);
  const filter = context.createBiquadFilter();
  filter.type = type;
  tune(filter.frequency, at, total);
  const gain = envelopeGain(target, at, attackTime, total, spec.gain);
  source.connect(filter);
  filter.connect(gain);
  release(source, filter, gain);
  target.track?.(source);
  source.start(at);
  source.stop(at + total);
  return source;
}

export function playFilteredNoiseBurst(target: VoiceTarget, spec: NoiseBurstSpec): AudioBufferSourceNode {
  return playFilteredNoise(target, spec, "lowpass", (freq, at) => {
    freq.setValueAtTime(clamp(spec.cutoff, 20, 20000), at);
  });
}

export function playNoiseSweep(target: VoiceTarget, spec: NoiseSweepSpec): AudioBufferSourceNode {
  return playFilteredNoise(target, spec, "bandpass", (freq, at, total) => {
    freq.setValueAtTime(clamp(spec.fromFreq, 20, 20000), at);
    freq.exponentialRampToValueAtTime(clamp(spec.toFreq, 20, 20000), at + total);
  });
}
