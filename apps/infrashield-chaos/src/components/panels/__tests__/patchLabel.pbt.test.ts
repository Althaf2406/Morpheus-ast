/**
 * Property 8: The patch label is a pure function of `modelId`.
 *
 * **Validates: Requirements 6.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { patchLabel } from "../patchLabel.ts";

// --- Generators ---
const modelIdArb = fc.oneof(fc.constant("deterministic"), fc.string());

describe("Property 8: patch label is a pure function of modelId", () => {
  it("is deterministic iff modelId === 'deterministic'", () => {
    fc.assert(
      fc.property(modelIdArb, (modelId) => {
        expect(patchLabel({ modelId }).isDeterministic).toBe(modelId === "deterministic");
      }),
    );
  });

  it("returns the same label for the same input", () => {
    fc.assert(
      fc.property(modelIdArb, (modelId) => {
        expect(patchLabel({ modelId })).toEqual(patchLabel({ modelId }));
      }),
    );
  });

  it("labels AI patches with their model id and deterministic ones as rule-based", () => {
    fc.assert(
      fc.property(modelIdArb, (modelId) => {
        const label = patchLabel({ modelId });
        if (modelId === "deterministic") expect(label.text).toContain("rule-based");
        else expect(label.text).toContain(modelId);
      }),
    );
  });
});
