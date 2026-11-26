// @vitest-environment jsdom
/**
 * Render tests for FaultTypeSelect.
 *
 * **Validates: Requirements 4.1**
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FaultType } from "../../../adapter";
import { FaultTypeSelect } from "../FaultTypeSelect.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Helpers ---
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

describe("FaultTypeSelect", () => {
  it("lists exactly the four fault types in order", () => {
    act(() => root.render(<FaultTypeSelect value="LATENCY" onChange={() => undefined} />));
    const options = Array.from(container.querySelectorAll("option")).map((o) => o.value);
    expect(options).toEqual(["LATENCY", "NETWORK_FAILURE", "EXTREME_PAYLOAD", "UNCAUGHT_EXCEPTION"]);
  });

  it("fires onChange with the chosen value", () => {
    const onChange = vi.fn<(next: FaultType) => void>();
    act(() => root.render(<FaultTypeSelect value="LATENCY" onChange={onChange} />));
    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    if (select === null) return;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, "EXTREME_PAYLOAD");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("EXTREME_PAYLOAD");
  });
});
