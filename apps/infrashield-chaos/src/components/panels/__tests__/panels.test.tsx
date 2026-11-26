// @vitest-environment jsdom
/**
 * Render tests for button gating, download flow, blast-radius and findings cards.
 *
 * **Validates: Requirements 6.10, 7.7, 7.8**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAULT, FINDING, NODES } from "./panelFixtures.ts";
import { BlastRadiusCard } from "../BlastRadiusCard.tsx";
import { BugfixDownloadButton } from "../BugfixDownloadButton.tsx";
import { BugfixSpecButton } from "../BugfixSpecButton.tsx";
import { PatchController } from "../PatchController.tsx";
import { SecurityFindingsCard } from "../SecurityFindingsCard.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Helpers ---
let container: HTMLDivElement;
let root: Root;

function render(element: ReactElement): void {
  act(() => root.render(element));
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label));
  if (found === undefined) throw new Error(`button not found: ${label}`);
  return found;
}

function click(el: HTMLElement): void {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
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

// --- Tests ---
describe("PatchController gating", () => {
  const noop = (): void => undefined;

  it("disables Apply and Rollback with no patch", () => {
    render(<PatchController hasPatch={false} isPatchApplied={false} onApplyPatch={noop} onRollback={noop} />);
    expect(button("Apply Patch").disabled).toBe(true);
    expect(button("Rollback").disabled).toBe(true);
  });

  it("enables Apply but keeps Rollback disabled until a patch is applied", () => {
    const onApply = vi.fn();
    render(<PatchController hasPatch isPatchApplied={false} onApplyPatch={onApply} onRollback={noop} />);
    expect(button("Apply Patch").disabled).toBe(false);
    expect(button("Rollback").disabled).toBe(true);
    click(button("Apply Patch"));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("enables Rollback once the patch is applied", () => {
    const onRollback = vi.fn();
    render(<PatchController hasPatch isPatchApplied onApplyPatch={noop} onRollback={onRollback} />);
    expect(button("Apply Patch").disabled).toBe(true);
    click(button("Rollback"));
    expect(onRollback).toHaveBeenCalledTimes(1);
  });
});

describe("Bugfix buttons", () => {
  const adapter = {
    generateBugfixSpec: vi.fn(),
    generateBugfixFile: vi.fn(() => ({ fileName: "bugfix.md", content: "# spec for alpha" })),
  };

  it("disables Generate Bugfix Spec and Download with no fault", () => {
    render(
      <>
        <BugfixSpecButton adapter={adapter} isEnabled={false} />
        <BugfixDownloadButton adapter={adapter} isEnabled={false} />
      </>,
    );
    expect(button("Generate Bugfix Spec").disabled).toBe(true);
    expect(button("Download").disabled).toBe(true);
  });

  it("Download calls generateBugfixFile and triggers a download", () => {
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });

    render(<BugfixDownloadButton adapter={adapter} isEnabled />);
    expect(button("Download").disabled).toBe(false);
    click(button("Download"));

    expect(adapter.generateBugfixFile).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe("bugfix.md");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});

describe("BlastRadiusCard", () => {
  it("shows the score and the cascade path", () => {
    render(<BlastRadiusCard blastRadiusScore={FAULT.blastRadiusScore} lastFault={FAULT} nodes={NODES} />);
    expect(container.textContent).toContain("75%");
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("src/b.ts");
    expect(container.textContent).not.toContain("src/a.ts::alpha");
  });
});

describe("SecurityFindingsCard", () => {
  it("shows the findings from layout.securityFindings", () => {
    render(<SecurityFindingsCard findings={[FINDING]} />);
    expect(container.textContent).toContain("Unsanitised query");
    expect(container.textContent).toContain("HIGH");
    expect(container.textContent).toContain("src/db.ts:12");
  });

  it("shows the empty state with no findings", () => {
    render(<SecurityFindingsCard findings={[]} />);
    expect(container.textContent).toContain("No findings");
  });
});
