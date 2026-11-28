import { vi } from "vitest";

/** Test double for AudioContext: records every node creation instead of producing sound. */
export interface MockParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

export interface MockNode {
  readonly kind: string;
  type: string;
  loop: boolean;
  buffer: unknown;
  onended: (() => void) | null;
  gain: MockParam;
  frequency: MockParam;
  Q: MockParam;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

export interface MockContext {
  readonly nodes: MockNode[];
  readonly destination: object;
  readonly sampleRate: number;
  currentTime: number;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  createOscillator(): MockNode;
  createGain(): MockNode;
  createBufferSource(): MockNode;
  createBiquadFilter(): MockNode;
  createBuffer(channels: number, length: number): { getChannelData(): Float32Array };
}

function param(value = 1): MockParam {
  return {
    value,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

export function createMockContext(): MockContext {
  const nodes: MockNode[] = [];
  const make = (kind: string): MockNode => {
    const node: MockNode = {
      kind,
      type: "",
      loop: false,
      buffer: null,
      onended: null,
      gain: param(1),
      frequency: param(440),
      Q: param(1),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    nodes.push(node);
    return node;
  };
  return {
    nodes,
    destination: {},
    sampleRate: 8000,
    currentTime: 0,
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: () => make("oscillator"),
    createGain: () => make("gain"),
    createBufferSource: () => make("bufferSource"),
    createBiquadFilter: () => make("filter"),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
}

export const countKind = (ctx: MockContext, kind: string): number =>
  ctx.nodes.filter((node) => node.kind === kind).length;

export const asAudioContext = (ctx: MockContext): AudioContext =>
  ctx as unknown as AudioContext;
