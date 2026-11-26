// @vitest-environment jsdom
/** HUD text tests for the title, goal line and counters (REQ 4.1-4.4). */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CounterBar } from "../CounterBar.tsx";
import { HudTitle } from "../HudTitle.tsx";

const GOAL = "Exorcise code smells. Every spell edits real code.";

afterEach(cleanup);

describe("HudTitle", () => {
  it("renders the title and the goal line", () => {
    render(<HudTitle goalLine={GOAL} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("NECRO-COMPILER");
    expect(screen.getByText(GOAL)).toBeTruthy();
  });
});

describe("CounterBar", () => {
  it("renders exactly 'Monsters 6 / 6' and a separate purified element", () => {
    const { container } = render(<CounterBar aliveCount={6} totalCount={6} purifiedCount={0} />);
    const monsters = container.querySelector(".hud-counter--monsters");
    const purified = container.querySelector(".hud-counter--purified");
    expect(monsters?.textContent).toBe("Monsters 6 / 6");
    expect(purified?.textContent).toBe("Purified 0");
    expect(monsters).not.toBe(purified);
  });

  it("updates both counters together and never says Vulnerable", () => {
    const { container } = render(<CounterBar aliveCount={4} totalCount={6} purifiedCount={2} />);
    expect(container.querySelector(".hud-counter--monsters")?.textContent).toBe("Monsters 4 / 6");
    expect(container.querySelector(".hud-counter--purified")?.textContent).toBe("Purified 2");
    expect(container.textContent).not.toContain("Vulnerable");
  });
});
