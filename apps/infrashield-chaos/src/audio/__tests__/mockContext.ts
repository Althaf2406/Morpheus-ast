// --- Mock_Context: records node creation instead of producing sound ---

export class MockParam {
  value = 0;
  readonly ramps: number[] = [];
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
    this.ramps.push(v);
  }
  exponentialRampToValueAtTime(v: number): void {
    this.value = v;
  }
  cancelScheduledValues(): void {}
}

export class MockNode {
  readonly gain = new MockParam();
  readonly frequency = new MockParam();
  type = "";
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
  addEventListener(): void {}
}

export class MockContext {
  readonly created: string[] = [];
  readonly destination = new MockNode();
  readonly currentTime = 0;
  readonly sampleRate = 8000;
  closed = false;

  private make(kind: string): MockNode {
    this.created.push(kind);
    return new MockNode();
  }
  count(kind: string): number {
    return this.created.filter((k) => k === kind).length;
  }
  createGain = (): MockNode => this.make("gain");
  createOscillator = (): MockNode => this.make("oscillator");
  createBufferSource = (): MockNode => this.make("bufferSource");
  createBiquadFilter = (): MockNode => this.make("filter");
  createBuffer = (_channels: number, length: number): { getChannelData: () => Float32Array } => {
    this.created.push("buffer");
    return { getChannelData: () => new Float32Array(length) };
  };
  resume = (): Promise<void> => Promise.resolve();
  close = (): Promise<void> => {
    this.closed = true;
    return Promise.resolve();
  };
}

export interface MockFactory {
  readonly factory: () => AudioContext;
  readonly contexts: MockContext[];
}

export function createMockFactory(): MockFactory {
  const contexts: MockContext[] = [];
  return {
    contexts,
    factory: () => {
      const ctx = new MockContext();
      contexts.push(ctx);
      return ctx as unknown as AudioContext;
    },
  };
}
