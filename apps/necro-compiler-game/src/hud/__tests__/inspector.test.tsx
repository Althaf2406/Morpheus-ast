// @vitest-environment jsdom
/** Unit tests for the Live Engine Inspector: panel content, toggle button and the "I" key. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DungeonTelemetry } from "../../adapter.ts";
import { InspectorDock } from "../inspector/InspectorDock.tsx";
import { InspectorPanel } from "../inspector/InspectorPanel.tsx";
import { useInspectorOpen } from "../inspector/useInspectorOpen.ts";

afterEach(cleanup);

// --- Fixtures ---
const BEFORE = "a".repeat(64);
const AFTER_CAST = "b".repeat(64);

const idle: DungeonTelemetry = {
  roomCount: 4,
  entityCount: 3,
  lastSpellCast: null,
  lastSpellRollback: false,
  activeAISuggestion: null,
  lastDiff: null,
  targetFunction: null,
  fingerprints: { before: null, afterMutation: null, afterRollback: null },
  rollbackVerified: null,
};

const undone: DungeonTelemetry = {
  ...idle,
  lastSpellRollback: true,
  targetFunction: "handleGetUsers",
  fingerprints: { before: BEFORE, afterMutation: AFTER_CAST, afterRollback: BEFORE },
  rollbackVerified: true,
  lastDiff: {
    mutationId: "m1",
    filePath: "sample/api.ts",
    hunks: [
      {
        beforeStartLine: 10,
        beforeLineCount: 2,
        afterStartLine: 10,
        afterLineCount: 2,
        lines: [
          { kind: "context", text: "function f() {", beforeLine: 10, afterLine: 10 },
          { kind: "removed", text: "  const unused = 1;", beforeLine: 11, afterLine: null },
          { kind: "added", text: "  // purified", beforeLine: null, afterLine: 11 },
        ],
      },
    ],
  },
};

const reindented: DungeonTelemetry = {
  ...undone,
  lastDiff: {
    mutationId: "m2",
    filePath: "sample/api.ts",
    hunks: [
      {
        beforeStartLine: 10,
        beforeLineCount: 3,
        afterStartLine: 10,
        afterLineCount: 4,
        lines: [
          { kind: "context", text: "function f() {", beforeLine: 10, afterLine: 10 },
          { kind: "added", text: "  try {", beforeLine: null, afterLine: 11 },
          { kind: "reindent", text: "    run();", beforeText: "  run();", beforeLine: 11, afterLine: 12 },
          { kind: "reindent", text: "    stop();", beforeText: "  stop();", beforeLine: 12, afterLine: 13 },
        ],
      },
    ],
  },
};
function Harness() {
  const inspector = useInspectorOpen();
  return <InspectorDock open={inspector.open} telemetry={idle} onToggle={inspector.toggle} />;
}

// --- Tests ---
describe("InspectorPanel", () => {
  it("shows file, function, coloured diff lines with numbers and the verified badge", () => {
    const { container } = render(<InspectorPanel telemetry={undone} onClose={() => undefined} />);
    expect(screen.getByText("sample/api.ts")).toBeTruthy();
    expect(screen.getByText("handleGetUsers")).toBeTruthy();
    const removed = container.querySelector(".hud-diff__row--removed");
    const added = container.querySelector(".hud-diff__row--added");
    expect(removed?.textContent).toContain("11");
    expect(removed?.textContent).toContain("const unused = 1;");
    expect(added?.textContent).toContain("// purified");
    expect(screen.getByText("Rollback verified: SHA-256 identical aaaaaaaaaaaa")).toBeTruthy();
  });

  it("flags a mismatch and shows no badge before any undo", () => {
    const { container, rerender } = render(<InspectorPanel telemetry={idle} onClose={() => undefined} />);
    expect(container.querySelector(".hud-verify")).toBeNull();
    expect(screen.getByText("No spell cast yet.")).toBeTruthy();
    rerender(<InspectorPanel telemetry={{ ...undone, rollbackVerified: false }} onClose={() => undefined} />);
    expect(screen.getByText(/Rollback mismatch/)).toBeTruthy();
  });

  it("closes from its close button", () => {
    let closed = 0;
    render(<InspectorPanel telemetry={idle} onClose={() => (closed += 1)} />);
    fireEvent.click(screen.getByRole("button", { name: /Close inspector/ }));
    expect(closed).toBe(1);
  });
});

describe("InspectorDiff whitespace changes", () => {
  it("shows each re-indented line once, dim and marked, while real additions stay added", () => {
    const { container } = render(<InspectorPanel telemetry={reindented} onClose={() => undefined} />);
    const toggle = screen.getByLabelText("Show whitespace changes") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(container.querySelectorAll(".hud-diff__row--added")).toHaveLength(1);
    expect(container.querySelectorAll(".hud-diff__row--removed")).toHaveLength(0);
    const dim = container.querySelectorAll(".hud-diff__row--reindent");
    expect(dim).toHaveLength(2);
    expect(dim[0]?.textContent).toContain("    run();");
    expect(dim[0]?.textContent).toContain("↳ indent");
    expect(dim[0]?.textContent).toContain("re-indented");
  });
  it("shows the full removed/added diff when the toggle is on", () => {
    const { container } = render(<InspectorPanel telemetry={reindented} onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Show whitespace changes"));
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(container.querySelectorAll(".hud-diff__row--reindent")).toHaveLength(0);
    const removed = container.querySelectorAll(".hud-diff__row--removed");
    const added = container.querySelectorAll(".hud-diff__row--added");
    expect(removed).toHaveLength(2);
    expect(added).toHaveLength(3);
    expect(removed[0]?.textContent).toContain("  run();");
    expect(added[1]?.textContent).toContain("    run();");
    expect(container.textContent).not.toContain("↳ indent");
  });
});
describe("InspectorDock and the I key", () => {
  it("opens and closes with the button, keeping aria-expanded in sync", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: /Show Inspector/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("region", { name: "Live Engine Inspector" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hide Inspector/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Hide Inspector/ }));
    expect(screen.queryByRole("region", { name: "Live Engine Inspector" })).toBeNull();
  });

  it("toggles on the I key, but not with a modifier or while typing", () => {
    render(
      <>
        <input aria-label="note" />
        <Harness />
      </>
    );
    const panel = () => screen.queryByRole("region", { name: "Live Engine Inspector" });
    fireEvent.keyDown(window, { key: "i" });
    expect(panel()).not.toBeNull();
    fireEvent.keyDown(window, { key: "i", ctrlKey: true });
    expect(panel()).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "i" });
    expect(panel()).not.toBeNull();
    fireEvent.keyDown(window, { key: "I" });
    expect(panel()).toBeNull();
  });
});
