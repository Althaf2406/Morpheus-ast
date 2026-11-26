// @vitest-environment jsdom
/** HUD tests for the immune-monster lore text and cast control (REQ 7.1-7.4). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DungeonEntity, DungeonRoom } from "../../adapter.ts";
import type { EntityTarget } from "../../spells/entityIndex.ts";
import { MonsterCard } from "../MonsterCard.tsx";
import { SpellBar } from "../SpellBar.tsx";

const room: DungeonRoom = {
  id: "room-1",
  functionName: "handler",
  filePath: "src/handler.ts",
  size: "SMALL",
  cyclomaticComplexity: 1,
  isCircularDep: false,
  entities: [],
  corridorIds: [],
};

const targetWith = (suggestedSpell: DungeonEntity["suggestedSpell"]): EntityTarget => ({
  room,
  entity: {
    entityId: "e1",
    findingId: "f1",
    type: "ZOMBIE_VARIABLE",
    severity: "LOW",
    title: "Unused variable",
    description: "x is never read",
    suggestedSpell,
  },
});

const SPELL = { splices: [{ filePath: "src/handler.ts", startIndex: 0, endIndex: 1, replacement: "", description: "remove" }] };

const renderBar = (target: EntityTarget): void => {
  render(
    <SpellBar
      selected={target}
      visual="ALIVE"
      pending={null}
      castEnabled={target.entity.suggestedSpell !== null}
      undoEnabled={false}
      onCast={() => undefined}
      onUndo={() => undefined}
    />,
  );
};

afterEach(cleanup);

describe("MonsterCard lore text", () => {
  it("shows the Holy Incantation lore and not the old text when there is no spell", () => {
    render(<MonsterCard target={targetWith(null)} visual="ALIVE" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("immune to ordinary spells");
    expect(text).toContain("Holy Incantation");
    expect(text).not.toContain("No spell is available");
  });

  it("omits the lore text when a spell exists", () => {
    render(<MonsterCard target={targetWith(SPELL)} visual="ALIVE" />);
    expect(document.body.textContent ?? "").not.toContain("Holy Incantation");
  });
});

describe("SpellBar cast control", () => {
  it("keeps the cast button enabled for a non-null spell", () => {
    renderBar(targetWith(SPELL));
    const cast = screen.getByRole("button", { name: /Cast Refactoring Spell/ }) as HTMLButtonElement;
    expect(cast.disabled).toBe(false);
  });

  it("disables the cast button for a null spell", () => {
    renderBar(targetWith(null));
    const cast = screen.getByRole("button", { name: /Cast Refactoring Spell/ }) as HTMLButtonElement;
    expect(cast.disabled).toBe(true);
  });
});

describe("MonsterCard source size", () => {
  it("has at most 150 lines", () => {
    const source = readFileSync(resolve(process.cwd(), "src/hud/MonsterCard.tsx"), "utf8");
    expect(source.split("\n").length).toBeLessThanOrEqual(150);
  });
});
