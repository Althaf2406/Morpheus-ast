// @vitest-environment jsdom
/**
 * Unit tests for SwitchWorldLink and HubLink.
 * Validates: Requirements 14.3, 14.4
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HubLink } from "../HubLink";
import { SwitchWorldLink } from "../SwitchWorldLink";
import { HUB_URL_CONSTANT } from "../hubUrl";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLElement;
let root: Root;
function href(element: ReactElement): string {
  act(() => root.render(element));
  const anchor = host.querySelector("a");
  if (anchor === null) throw new Error("no anchor rendered");
  return anchor.getAttribute("href") ?? "";
}
describe("tour links", () => {
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    window.history.replaceState(null, "", "/");
  });
  it("SwitchWorldLink points to the necro site and keeps ?repo=", () => {
    window.history.replaceState(null, "", "/?repo=owner%2Fname");
    const url = new URL(href(<SwitchWorldLink />));
    expect(url.origin).toBe("https://necro-compiler.vercel.app");
    expect(url.searchParams.get("repo")).toBe("owner/name");
  });
  it("SwitchWorldLink has no repo param when none is present", () => {
    expect(new URL(href(<SwitchWorldLink />)).searchParams.has("repo")).toBe(false);
  });
  it("HubLink uses HUB_URL_CONSTANT", () => {
    const url = new URL(href(<HubLink />));
    expect(url.origin).toBe(new URL(HUB_URL_CONSTANT).origin);
    expect(href(<HubLink />)).toBe(HUB_URL_CONSTANT);
  });
});
