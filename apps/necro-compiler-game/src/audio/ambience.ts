import type { VoiceHandle } from "./voices";

const DRONE_FADE_SECONDS = 2;
const NOISE_SECONDS = 4;

function createLoopedNoise(context: AudioContext): AudioBufferSourceNode {
  const length = Math.floor(context.sampleRate * NOISE_SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

// Dungeon drone: two detuned low oscillators plus low-pass wind swept by a slow LFO
export function buildDroneAmbience(context: AudioContext, destination: AudioNode): VoiceHandle {
  const now = context.currentTime;
  const bus = context.createGain();
  bus.gain.setValueAtTime(0, now);
  bus.gain.linearRampToValueAtTime(0.4, now + DRONE_FADE_SECONDS);
  bus.connect(destination);

  const low = context.createOscillator();
  low.type = "sine";
  low.frequency.value = 55;
  const detuned = context.createOscillator();
  detuned.type = "triangle";
  detuned.frequency.value = 55.8;
  const droneGain = context.createGain();
  droneGain.gain.value = 0.35;
  low.connect(droneGain);
  detuned.connect(droneGain);
  droneGain.connect(bus);

  const wind = createLoopedNoise(context);
  const windFilter = context.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 350;
  windFilter.Q.value = 2;
  const windGain = context.createGain();
  windGain.gain.value = 0.12;
  wind.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(bus);

  const lfo = context.createOscillator();
  lfo.frequency.value = 0.1;
  const lfoDepth = context.createGain();
  lfoDepth.gain.value = 200;
  lfo.connect(lfoDepth);
  lfoDepth.connect(windFilter.frequency);

  const sources: readonly AudioScheduledSourceNode[] = [low, detuned, wind, lfo];
  const nodes: readonly AudioNode[] = [
    ...sources, droneGain, windFilter, windGain, lfoDepth, bus,
  ];
  sources.forEach((source) => source.start(now));

  return {
    stop() {
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      });
      nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      });
    },
  };
}
