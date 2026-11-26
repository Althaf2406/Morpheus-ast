// @vitest-environment jsdom
/**
 * Render tests for the patch text and the expandable cascade list.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SREDashboardData } from "../../../adapter.ts";
import { AIPatchCard } from "../AIPatchCard.tsx";
import { CascadeList } from "../CascadeList.tsx";
import { NODES } from "./panelFixtures.ts";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// --- Fixtures ---
type Patch = NonNullable<SREDashboardData["lastPatch"]>;
const CODE = "try {\n  run();\n} catch (error) {\n  report(error);\n}";
const PATCH: Patch = {
  mutationId: "m1", targetFunctionId: "src/a.ts::alpha", rationale: "wrap the call", confidence: 0.9,
  modelId: "deterministic", durationMs: 1,
  suggestedSplices: [{ filePath: "src/a.ts", startIndex: 4, endIndex: 9, replacement: CODE, description: "add guard" }],
};
const STEPS = Array.from({ length: 8 }, (_, i) => ({ functionId: `fn${i}`, reason: "NO_FALLBACK" as const, depth: i }));
// --- Helpers ---
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
// --- Tests ---
describe("AIPatchCard", () => {
  it("types the replacement code out in full, with rationale and splice details", () => {
    act(() => root.render(<AIPatchCard lastPatch={PATCH} />));
    expect(container.textContent).toContain("wrap the call");
    expect(container.textContent).toContain("src/a.ts");
    expect(container.textContent).toContain("[4, 9)");
    expect(container.textContent).toContain("add guard");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.querySelector("[aria-label='Replacement code 1']")?.textContent).toBe(CODE);
  });
  it("shows the whole patch at once under prefers-reduced-motion", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    act(() => root.render(<AIPatchCard lastPatch={PATCH} />));
    expect(container.querySelector("[aria-label='Replacement code 1']")?.textContent).toBe(CODE);
  });
});
describe("CascadeList", () => {
  it("shows five steps, then reveals the rest on demand", () => {
    act(() => root.render(<CascadeList cascadePath={STEPS} nodesById={new Map(NODES.map((n) => [n.id, n]))} />));
    expect(container.querySelectorAll("li")).toHaveLength(5);
    const toggle = container.querySelector("button");
    expect(toggle?.textContent).toBe("+3 more");
    act(() => toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelectorAll("li")).toHaveLength(8);
  });
});
