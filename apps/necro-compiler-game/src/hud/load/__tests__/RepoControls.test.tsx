// @vitest-environment jsdom
/**
 * Repository controls and empty-layout message.
 *
 * **Validates: Requirements 5.2, 7.3**
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DungeonLayout } from "../../../adapter";
import { LayoutNotices } from "../LayoutNotices";
import { RepoControls } from "../RepoControls";

afterEach(cleanup);
const noop = (): void => undefined;

describe("RepoControls", () => {
  it("shows 'Back to sample repository' only while a loaded repository is active", () => {
    const { rerender } = render(<RepoControls loaded={false} onOpenLoad={noop} onBackToSample={noop} />);
    expect(screen.getByRole("button", { name: "Load your code" })).toBeTruthy();
    expect(screen.queryByText("Back to sample repository")).toBeNull();
    rerender(<RepoControls loaded onOpenLoad={noop} onBackToSample={noop} />);
    expect(screen.getByText("Back to sample repository")).toBeTruthy();
  });
});

describe("LayoutNotices", () => {
  it("says the code is clean when there are no monsters", () => {
    const layout = { totalEntities: 0, corridors: [] } as unknown as DungeonLayout;
    render(<LayoutNotices layout={layout} />);
    expect(screen.getByText("No monsters found, your code is clean")).toBeTruthy();
  });
});
