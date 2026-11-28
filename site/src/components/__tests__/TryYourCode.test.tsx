import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { REPO_FORMAT_HINT } from "../../repoLink";
import { TryYourCode } from "../TryYourCode";

const assign = vi.fn();

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function input(): HTMLInputElement {
  return screen.getByLabelText("GitHub repository") as HTMLInputElement;
}

describe("TryYourCode", () => {
  it("fills the input when an example chip is clicked", () => {
    render(<TryYourCode />);
    fireEvent.click(screen.getByRole("button", { name: "expressjs/cors" }));
    expect(input().value).toBe("expressjs/cors");
  });

  it("shows the format hint as an alert and does not navigate on invalid input", () => {
    render(<TryYourCode />);
    fireEvent.change(input(), { target: { value: "not a repo" } });
    fireEvent.click(screen.getByRole("button", { name: "Open as dungeon" }));
    expect(screen.getByRole("alert").textContent).toBe(REPO_FORMAT_HINT);
    expect(assign).not.toHaveBeenCalled();
  });

  it("treats empty input as invalid on form submit", () => {
    render(<TryYourCode />);
    fireEvent.submit(input().closest("form") as HTMLFormElement);
    expect(screen.getByRole("alert").textContent).toBe(REPO_FORMAT_HINT);
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens the dungeon app with the repo param", () => {
    render(<TryYourCode />);
    fireEvent.change(input(), { target: { value: "expressjs/cors" } });
    fireEvent.click(screen.getByRole("button", { name: "Open as dungeon" }));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("https://necro-compiler.vercel.app?repo=expressjs/cors");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("opens the city app with the repo param from a github URL", () => {
    render(<TryYourCode />);
    fireEvent.change(input(), { target: { value: "https://github.com/sindresorhus/ky.git" } });
    fireEvent.click(screen.getByRole("button", { name: "Open as city" }));
    expect(assign).toHaveBeenCalledWith("https://infrashield-3d.vercel.app?repo=sindresorhus/ky");
  });
});
