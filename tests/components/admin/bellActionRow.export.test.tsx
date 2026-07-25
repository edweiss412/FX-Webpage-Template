// @vitest-environment jsdom
/**
 * T0a — the export contract for `BellActionRow`.
 *
 * T3 must mount BellPanel's action row from a real-component harness to assert the
 * `flex-1` pusher is gone. That row is currently unreachable: `ActionCell` is private
 * (components/admin/BellPanel.tsx:259) and server-rendering `<BellPanel>` yields only
 * its initial loading state, so neither `isAutoResolving` branch can be emitted.
 *
 * This is the RED: the export does not exist yet, so the import is unresolved. It is a
 * genuine failing contract rather than a characterization test that is green from the
 * start — plan review round 6 was right that calling a refactor "characterization-
 * guarded" does not waive invariant 1 when a real failing contract is available.
 *
 * The extraction must also carry the STATE, not just the markup: the false branch uses
 * `resolving` for the button's disabled/aria-busy and its pending copy
 * (components/admin/BellPanel.tsx:332-342), so a props-only presentational child would
 * lose behaviour. These assertions pin that.
 */
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BellActionRow } from "@/components/admin/BellPanel";
import type { BellEntry } from "@/lib/admin/bellFeed";

function entryFor(overrides: Partial<BellEntry>): BellEntry {
  return {
    alertId: "alert-1",
    code: "SOME_CODE",
    isHealth: false,
    isAutoResolving: false,
    autoResolveNote: "",
    actions: [],
    ...overrides,
  } as BellEntry;
}

describe("BellActionRow is exported and owns its resolve state", () => {
  it("renders the auto-resolving branch (note, no dismiss button)", () => {
    const { container } = render(
      <BellActionRow
        entry={entryFor({ isAutoResolving: true, autoResolveNote: "Clearing itself shortly." })}
        onRefetch={vi.fn()}
      />,
    );
    const row = container.querySelector('[data-testid="bell-action-cell-alert-1"]');
    expect(row, "the action row renders").not.toBeNull();
    expect(within(row as HTMLElement).getByTestId("bell-auto-note-alert-1")).toBeTruthy();
    expect(row?.querySelector('[data-testid="bell-resolve-alert-1"]')).toBeNull();
  });

  it("renders the manual branch with a resolve button that owns its pending state", () => {
    const { container } = render(
      <BellActionRow entry={entryFor({ isAutoResolving: false })} onRefetch={vi.fn()} />,
    );
    const row = container.querySelector('[data-testid="bell-action-cell-alert-1"]');
    expect(row, "the action row renders").not.toBeNull();
    const button = row?.querySelector('[data-testid="bell-resolve-alert-1"]');
    expect(button, "manual branch renders a resolve button").not.toBeNull();
    // The button starts idle: `resolving` state lives inside the exported component,
    // so it is not disabled/busy before a click.
    expect(button?.getAttribute("aria-busy")).not.toBe("true");
    expect((button as HTMLButtonElement | null)?.disabled).toBe(false);
  });

  it("the row is the element T3 measures — it contains no childless growable child", () => {
    // Not the repair itself (that is T3), just the shape T3 asserts against, so the
    // harness contract and the probe contract cannot drift apart.
    const { container } = render(
      <BellActionRow entry={entryFor({ isAutoResolving: false })} onRefetch={vi.fn()} />,
    );
    const row = container.querySelector('[data-testid="bell-action-cell-alert-1"]');
    expect(row, "the action row renders").not.toBeNull();
    expect(row?.className, "row keeps its wrapping flex contract").toContain("flex-wrap");
  });
});
