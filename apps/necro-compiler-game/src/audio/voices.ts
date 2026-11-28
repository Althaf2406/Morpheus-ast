export const MAX_VOICE_GAIN = 0.5;
export const MAX_EFFECT_SECONDS = 2;

export interface EnvelopeSpec {
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
  readonly durationSeconds: number;
  readonly peakGain: number;
  readonly startOffset?: number;
}

export interface OscillatorSpec extends EnvelopeSpec {
  readonly freq: number;
  readonly type?: OscillatorType;
  readonly endFreq?: number;
}

export interface NoiseSpec extends EnvelopeSpec {
  readonly cutoff: number;
  readonly endCutoff?: number;
  readonly q?: number;
}

export interface VoiceHandle {
  stop(): void;
}

// Input sanitising
function num(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Envelope: gain starts and ends at 0, per-voice peak capped, duration capped
function createVoiceGain(context: AudioContext, destination: AudioNode, spec: EnvelopeSpec) {
  const duration = clamp(num(spec.durationSeconds, 0.1), 0.01, MAX_EFFECT_SECONDS);
  const attack = clamp(num(spec.attackSeconds, 0.01), 0.001, duration / 2);
  const release = clamp(num(spec.releaseSeconds, 0.05), 0.001, duration - attack);
  const peak = clamp(num(spec.peakGain, 0.1), 0, MAX_VOICE_GAIN);
  const start = context.currentTime + Math.max(0, num(spec.startOffset, 0));
  const end = start + duration;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + attack);
  gain.gain.setValueAtTime(peak, end - release);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(destination);
  return { gain, start, end };
}

// Lifecycle: nodes are released when the source ends or `stop` is called
function releaseOnEnd(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): VoiceHandle {
  const cleanup = (): void => {
    nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
    });
  };
  source.onended = cleanup;
  return {
    stop() {
      try {
        source.stop();
      } catch {
        // Not started or already stopped.
      }
      cleanup();
    },
  };
}

export function playEnvelopedOscillator(
  context: AudioContext,
  destination: AudioNode,
  spec: OscillatorSpec,
): VoiceHandle {
  const { gain, start, end } = createVoiceGain(context, destination, spec);
  const osc = context.createOscillator();
  const freq = Math.max(1, num(spec.freq, 440));
  osc.type = spec.type ?? "sine";
  osc.frequency.setValueAtTime(freq, start);
  if (spec.endFreq !== undefined) {
    osc.frequency.linearRampToValueAtTime(Math.max(1, num(spec.endFreq, freq)), end);
  }
  osc.connect(gain);
  osc.start(start);
  osc.stop(end);
  return releaseOnEnd(osc, [osc, gain]);
}

function playNoise(
  context: AudioContext,
  destination: AudioNode,
  spec: NoiseSpec,
  filterType: BiquadFilterType,
): VoiceHandle {
  const { gain, start, end } = createVoiceGain(context, destination, spec);
  const length = Math.max(1, Math.floor(context.sampleRate * (end - start)));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  const cutoff = Math.max(20, num(spec.cutoff, 1000));
  filter.type = filterType;
  filter.Q.value = clamp(num(spec.q, 1), 0.0001, 30);
  filter.frequency.setValueAtTime(cutoff, start);
  if (spec.endCutoff !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, num(spec.endCutoff, cutoff)), end);
  }
  source.connect(filter);
  filter.connect(gain);
  source.start(start);
  source.stop(end);
  return releaseOnEnd(source, [source, filter, gain]);
}

export function playFilteredNoiseBurst(
  context: AudioContext,
  destination: AudioNode,
  spec: NoiseSpec,
): VoiceHandle {
  return playNoise(context, destination, spec, "lowpass");
}

export function playNoiseSweep(
  context: AudioContext,
  destination: AudioNode,
  spec: NoiseSpec,
): VoiceHandle {
  return playNoise(context, destination, spec, "bandpass");
}
