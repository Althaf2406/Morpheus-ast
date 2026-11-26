import { describe, it, expect } from "vitest";
import { createMockSpellCaster } from "./mockSpellCaster.ts";

const request = {
  splices: [{ filePath: "src/a.ts", startIndex: 0, endIndex: 3, replacement: "x", description: "fix" }],
};

describe("mock spell caster", () => {
  it("returns a MutationResult-shaped result and allows one undo", async () => {
    const caster = createMockSpellCaster(0);
    const result = await caster.castSpell(request);
    expect(result).toMatchObject({ filePath: "src/a.ts", splicesApplied: 1 });
    expect(result.rollbackRecord.mutationId).toBe(result.mutationId);
    await caster.rollbackLastSpell();
    await expect(caster.rollbackLastSpell()).rejects.toThrow();
  });
});
