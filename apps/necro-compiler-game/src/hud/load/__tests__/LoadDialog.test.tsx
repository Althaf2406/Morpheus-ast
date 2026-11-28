// @vitest-environment jsdom
/**
 * Load_Dialog render tests.
 *
 * **Validates: Requirements 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LoadOutcome } from "../../../adapter";
import { LoadDialog } from "../LoadDialog";

afterEach(cleanup);

const SUCCESS = {
  ok: true, layout: {}, summary: {}, filesAnalyzed: 3, findingsCount: 2,
  skipped: [{ path: "big.ts", reason: "too large" }, { path: "a.py", reason: "unsupported" }],
} as unknown as LoadOutcome;

type Loader = (c: readonly unknown[]) => Promise<LoadOutcome>;
function mount(onLoad: Loader): void {
  render(<LoadDialog onLoad={onLoad} onLoadGitHub={vi.fn()} onClose={vi.fn()} />);
}
const codeBox = (): HTMLTextAreaElement => screen.getByLabelText(/Code to summon/) as HTMLTextAreaElement;
function submitCode(): void {
  fireEvent.change(codeBox(), { target: { value: "const a = 1;" } });
  fireEvent.click(screen.getByRole("button", { name: "Summon dungeon" }));
}

describe("LoadDialog tabs", () => {
  it("renders three tabs and moves selection with arrow keys", () => {
    mount(vi.fn());
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Paste code", "Upload files", "GitHub repo"]);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  });
});

describe("LoadDialog submission", () => {
  it("disables controls while submitting", async () => {
    mount(() => new Promise<LoadOutcome>(() => undefined));
    submitCode();
    await waitFor(() => expect(codeBox().disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Summon dungeon" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Summoning");
  });

  it("keeps the dialog open with input intact on error", async () => {
    mount(async () => ({ ok: false, message: "Nothing to load" }));
    submitCode();
    expect((await screen.findByRole("alert")).textContent).toBe("Nothing to load");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(codeBox().value).toBe("const a = 1;");
    expect(codeBox().disabled).toBe(false);
  });

  it("shows the summary and skipped list on success", async () => {
    mount(async () => SUCCESS);
    submitCode();
    expect(await screen.findByText("3 files analyzed / 2 skipped / 2 monsters found")).toBeTruthy();
    const items = screen.getAllByRole("listitem").map((l) => l.textContent);
    expect(items).toEqual(["big.tstoo large", "a.pyunsupported"]);
  });
});
