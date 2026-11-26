// --- Timing: one warm-up call, then the median of five measured runs in ms ---
const MEASURED_RUNS = 5;

export function medianOfFive(fn: () => void): number {
  fn();
  const durations: number[] = [];
  for (let run = 0; run < MEASURED_RUNS; run += 1) {
    const start = performance.now();
    fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return durations[Math.floor(MEASURED_RUNS / 2)];
}
