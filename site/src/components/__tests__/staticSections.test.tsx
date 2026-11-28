import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { BuiltWithKiro } from "../BuiltWithKiro";
import { Footer } from "../Footer";
import { Hero } from "../Hero";
import { HowItWorks } from "../HowItWorks";
import { WorldCards } from "../WorldCard";

afterEach(cleanup);

describe("Hero", () => {
  it("renders the heading", () => {
    render(<Hero />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "MORPHEUS-AST: One skeleton. Two worlds.",
    );
  });
});

describe("WorldCards", () => {
  it("renders names, taglines and Enter links", () => {
    render(<WorldCards />);
    const necro = within(screen.getByRole("heading", { name: "NECRO-COMPILER" }).closest("article") as HTMLElement);
    expect(necro.getByText("Every monster is a real code smell. Every spell is a real refactor.")).toBeTruthy();
    expect(necro.getByRole("link", { name: "Enter NECRO-COMPILER" }).getAttribute("href")).toBe(
      "https://necro-compiler.vercel.app",
    );
    const infra = within(screen.getByRole("heading", { name: "InfraShield 3D" }).closest("article") as HTMLElement);
    expect(infra.getByText("Inject a fault. Watch the blast radius. Patch and roll back byte-exact.")).toBeTruthy();
    expect(infra.getByRole("link", { name: "Enter InfraShield 3D" }).getAttribute("href")).toBe(
      "https://infrashield-3d.vercel.app",
    );
  });
});

describe("HowItWorks", () => {
  it("renders exactly 3 steps", () => {
    render(<HowItWorks />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Parse with the TypeScript Compiler API",
      "Analyze topology and findings",
      "Mutate surgically with SHA-256 verified rollback",
    ]);
  });
});

describe("BuiltWithKiro", () => {
  it("lists Kiro features and links to the repo and usage doc", () => {
    render(<BuiltWithKiro />);
    for (const feature of ["Specs", "Steering", "Hooks", "Property-based tests"]) {
      expect(screen.getByText(feature)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "GitHub repository" }).getAttribute("href")).toBe(
      "https://github.com/Althaf2406/Morpheus-ast",
    );
    const doc = screen.getByRole("link", { name: "docs/KIRO_USAGE.md" }).getAttribute("href");
    expect(doc?.startsWith("https://github.com/Althaf2406/Morpheus-ast")).toBe(true);
    expect(doc?.endsWith("docs/KIRO_USAGE.md")).toBe(true);
  });
});

describe("Footer", () => {
  it("shows event, license and team names", () => {
    render(<Footer />);
    const text = screen.getByRole("contentinfo").textContent ?? "";
    for (const part of ["Kiroween 2026", "Skeleton Crew", "MIT license", "Althaf", "Bryan Carlie"]) {
      expect(text).toContain(part);
    }
  });
});
