// @vitest-environment jsdom
/**
 * Load_Dialog render tests.
 *
 * **Validates: Requirements 4.1, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoadOutcome } from "../../../adapter.ts";
import { LoadDialog } from "../LoadDialog.tsx";
import { click, press, submit, typeInto } from "./domHelpers.ts";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const SUCCESS = {
  ok: true, layout: {}, summary: {}, filesAnalyzed: 3, findingsCount: 2,
  skipped: [{ path: "big.ts", reason: "too large" }, { path: "a.py", reason: "unsupported" }],
} as unknown as LoadOutcome;

type Loader = (c: readonly unknown[]) => Promise<LoadOutcome>;
function mount(onLoad: Loader): void {
  act(() => root.render(<LoadDialog onLoad={onLoad} onLoadGitHub={vi.fn()} onClose={vi.fn()} />));
}
const q = <T extends Element>(sel: string): T => {
  const el = container.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const tabs = (): HTMLButtonElement[] => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

describe("LoadDialog tabs", () => {
  it("renders three tabs and moves selection with arrow keys", () => {
    mount(vi.fn());
    expect(tabs().map((t) => t.textContent)).toEqual(["Paste code", "Upload files", "GitHub repo"]);
    press(tabs()[0], "ArrowRight");
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    press(tabs()[1], "ArrowLeft");
    press(tabs()[0], "ArrowLeft");
    expect(tabs()[2].getAttribute("aria-selected")).toBe("true");
  });
});

describe("LoadDialog submission", () => {
  it("disables controls while submitting", async () => {
    mount(() => new Promise<LoadOutcome>(() => undefined));
    typeInto(q("#load-paste-code"), "const a = 1;");
    await submit(q("form"));
    expect(q<HTMLTextAreaElement>("#load-paste-code").disabled).toBe(true);
    expect(q<HTMLButtonElement>('form button[type="submit"]').disabled).toBe(true);
    expect(q('[role="status"]').textContent).toContain("Loading");
  });

  it("keeps the dialog open with input intact on error", async () => {
    mount(async () => ({ ok: false, message: "Nothing to load" }));
    typeInto(q("#load-paste-code"), "const a = 1;");
    await submit(q("form"));
    expect(q('[role="alert"]').textContent).toBe("Nothing to load");
    expect(q('[role="dialog"]')).toBeTruthy();
    expect(q<HTMLTextAreaElement>("#load-paste-code").value).toBe("const a = 1;");
    expect(q<HTMLTextAreaElement>("#load-paste-code").disabled).toBe(false);
  });

  it("shows the summary and skipped list on success", async () => {
    mount(async () => SUCCESS);
    typeInto(q("#load-paste-code"), "const a = 1;");
    await submit(q("form"));
    const text = container.textContent ?? "";
    expect(text).toContain("Files analyzed: 3");
    expect(text).toContain("Files skipped: 2");
    expect(text).toContain("Findings: 2");
    const items = Array.from(container.querySelectorAll('[aria-label="Skipped files"] li')).map((l) => l.textContent);
    expect(items).toEqual(["big.ts — too large", "a.py — unsupported"]);
    click(q("button:not([role])"));
  });
});
