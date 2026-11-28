// @vitest-environment jsdom
/**
 * Repository controls and empty-findings message.
 *
 * **Validates: Requirements 5.2, 7.3**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecurityFindingsCard } from "../../panels/SecurityFindingsCard.tsx";
import { LoadControls } from "../LoadControls.tsx";
import "./domHelpers.ts";

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

const noop = (): void => undefined;

describe("LoadControls", () => {
  it("shows 'Back to sample repository' only while a loaded repository is active", () => {
    act(() => root.render(<LoadControls isLoaded={false} onOpen={noop} onBack={noop} />));
    expect(container.textContent).toContain("Load your code");
    expect(container.textContent).not.toContain("Back to sample repository");
    act(() => root.render(<LoadControls isLoaded onOpen={noop} onBack={noop} />));
    expect(container.textContent).toContain("Back to sample repository");
  });
});

describe("empty findings", () => {
  it("says the city is healthy when there are no findings", () => {
    act(() => root.render(<SecurityFindingsCard findings={[]} />));
    expect(container.textContent).toContain("No findings, city is healthy");
  });
});
