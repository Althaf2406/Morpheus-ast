// @vitest-environment jsdom
/**
 * Render tests for the Live Engine Inspector: dock toggle, "I" key, diff, telemetry and rollback badge.
 *
 * **Validates: TASK-IS-10**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InspectorTelemetry } from "../../../adapter.ts";
import { useInspectorOpen } from "../../../hooks/useInspectorOpen.ts";
import { InspectorDock } from "../InspectorDock.tsx";
import { InspectorPanel } from "../InspectorPanel.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Fixtures ---
const BEFORE = "a".repeat(12) + "1".repeat(52);
const MUTATED = "b".repeat(64);
const BASE: InspectorTelemetry = {
  functionCount: 7, edgeCount: 9, lastFault: null, lastMutationId: "m-1", findingCount: 2,
  targetFunction: "fetchUser", rollbackVerified: null,
  fingerprints: { before: BEFORE, afterMutation: MUTATED, afterRollback: null },
  lastDiff: {
    mutationId: "m-1", filePath: "src/api.ts",
    hunks: [{
      beforeStartLine: 3, beforeLineCount: 2, afterStartLine: 3, afterLineCount: 2,
      lines: [
        { kind: "context", text: "ctx", beforeLine: 3, afterLine: 3 },
        { kind: "removed", text: "old", beforeLine: 4, afterLine: null },
        { kind: "added", text: "new", beforeLine: null, afterLine: 4 },
      ],
    }],
  },
};
const VERIFIED: InspectorTelemetry = {
  ...BASE, lastMutationId: null, rollbackVerified: true,
  fingerprints: { before: BEFORE, afterMutation: MUTATED, afterRollback: BEFORE },
};

// --- Helpers ---
let container: HTMLDivElement;
let root: Root;
const render = (element: ReactElement): void => act(() => root.render(element));
const toggleButton = (): HTMLButtonElement => container.querySelector("button[aria-controls]")!;
const press = (init: KeyboardEventInit, target: EventTarget = window): void =>
  act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init })); });

function Harness() {
  const { open, toggle } = useInspectorOpen();
  return <InspectorDock open={open} telemetry={BASE} onToggle={toggle} />;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// --- Panel ---
describe("InspectorPanel", () => {
  it("shows file, function, telemetry and a diff with signs and line numbers", () => {
    render(<InspectorPanel telemetry={BASE} onClose={() => undefined} />);
    const text = container.textContent ?? "";
    expect(text).toContain("src/api.ts");
    expect(text).toContain("fetchUser");
    expect(text).toContain("aaaaaaaaaaaa");
    expect(text).toContain("@@ -3,2 +3,2 @@");
    const rows = container.querySelectorAll("tbody tr");
    expect(rows[1]?.textContent).toContain("removed");
    expect(rows[1]?.textContent).toContain("old");
    expect(rows[2]?.textContent).toContain("added");
    expect(container.querySelector("[aria-label='Mutation diff']")?.getAttribute("tabindex")).toBe("0");
  });

  it("shows no badge before a rollback and the verified badge with 12 hash characters after", () => {
    render(<InspectorPanel telemetry={BASE} onClose={() => undefined} />);
    expect(container.textContent).not.toContain("Rollback verified");
    render(<InspectorPanel telemetry={VERIFIED} onClose={() => undefined} />);
    expect(container.textContent).toContain(`Rollback verified: SHA-256 identical ${BEFORE.slice(0, 12)}`);
  });

  it("reports a mismatch instead of a verification", () => {
    const bad: InspectorTelemetry = { ...VERIFIED, rollbackVerified: false };
    render(<InspectorPanel telemetry={bad} onClose={() => undefined} />);
    expect(container.textContent).toContain("Rollback mismatch");
  });

  it("explains an empty diff", () => {
    render(<InspectorPanel telemetry={{ ...BASE, lastDiff: null }} onClose={() => undefined} />);
    expect(container.textContent).toContain("No mutation applied yet.");
  });
});

// --- Toggle ---
describe("InspectorDock toggle", () => {
  it("opens and closes with the button and keeps aria-expanded in sync", () => {
    render(<Harness />);
    expect(toggleButton().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#sre-inspector")).toBeNull();
    act(() => toggleButton().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(toggleButton().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#sre-inspector")).not.toBeNull();
    act(() => toggleButton().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector("#sre-inspector")).toBeNull();
  });

  it("toggles with the I key but not with a modifier, while typing, or on repeat", () => {
    render(<Harness />);
    press({ key: "i", ctrlKey: true });
    press({ key: "i", metaKey: true });
    press({ key: "i", altKey: true });
    press({ key: "i", repeat: true });
    const input = document.createElement("input");
    document.body.appendChild(input);
    press({ key: "i" }, input);
    input.remove();
    expect(container.querySelector("#sre-inspector")).toBeNull();
    press({ key: "i" });
    expect(container.querySelector("#sre-inspector")).not.toBeNull();
    press({ key: "I" });
    expect(container.querySelector("#sre-inspector")).toBeNull();
  });
});
