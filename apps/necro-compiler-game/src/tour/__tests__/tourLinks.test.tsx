// @vitest-environment jsdom
/**
 * SwitchWorldLink and HubLink href construction.
 *
 * **Validates: Requirements 15.3, 15.5**
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HubLink } from "../HubLink";
import { HUB_URL_CONSTANT } from "../hubUrl";
import { INFRA_APP_URL, SwitchWorldLink } from "../SwitchWorldLink";

describe("tour links", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("SwitchWorldLink keeps the ?repo= param", () => {
    window.history.replaceState(null, "", "/?repo=octo/cat");
    render(<SwitchWorldLink />);
    const href = screen.getByRole("link", { name: "Switch world" }).getAttribute("href");
    const url = new URL(href ?? "");
    expect(url.origin).toBe(new URL(INFRA_APP_URL).origin);
    expect(url.searchParams.get("repo")).toBe("octo/cat");
  });

  it("SwitchWorldLink has no repo param when none is present", () => {
    render(<SwitchWorldLink />);
    const href = screen.getByRole("link", { name: "Switch world" }).getAttribute("href");
    expect(href).toBe(INFRA_APP_URL);
  });

  it("HubLink uses HUB_URL_CONSTANT", () => {
    render(<HubLink />);
    expect(screen.getByRole("link", { name: "Hub" }).getAttribute("href")).toBe(HUB_URL_CONSTANT);
  });
});
