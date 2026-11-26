import * as fc from "fast-check";
import type { InfraShieldAdapter } from "../../../adapter.ts";
type BugfixSpec = ReturnType<InfraShieldAdapter["generateBugfixSpec"]>;

// ─── Shared arbitraries ────────────────────────────────────────────────────────

export const scoreArb = fc.float({ min: 0, max: 1, noNaN: true });

const faultTypeArb = fc.constantFrom<BugfixSpec["faultType"]>(
  "LATENCY",
  "NETWORK_FAILURE",
  "EXTREME_PAYLOAD",
  "UNCAUGHT_EXCEPTION",
);

const spliceArb = fc.record({
  filePath:    fc.string({ minLength: 1 }),
  startIndex:  fc.nat(),
  endIndex:    fc.nat(),
  replacement: fc.string(),
  description: fc.string({ minLength: 1 }),
});

export const bugfixSpecArb: fc.Arbitrary<BugfixSpec> = fc.record({
  specId:              fc.string({ minLength: 1 }),
  title:               fc.string({ minLength: 1 }),
  targetFunctionId:    fc.string({ minLength: 1 }),
  filePath:            fc.string({ minLength: 1 }),
  currentBehavior:     fc.string(),
  expectedBehavior:    fc.string(),
  unchangedBehavior:   fc.string(),
  fixProperty:         fc.string(),
  preservationProperty:fc.string(),
  suggestedMutation:   fc.record({
    splices: fc.array(spliceArb, { maxLength: 8 }),
  }),
  faultType:           faultTypeArb,
  blastRadiusScore:    scoreArb,
  createdAt:           fc.integer({ min: 0 }),
});
