// @vitest-environment jsdom
// parse-data-quality-warnings — Task 13: layout assertion for the data-gaps
// chip row.
//
// TRIGGER ASSESSMENT (AGENTS.md "fixed-height/width parent containing flex/grid
// children" → real-browser getBoundingClientRect mandate): NOT TRIGGERED for any
// data-gap surface. Every flex parent this feature adds is CONTENT-height with an
// EXPLICIT `items-center` and `flex-wrap`:
//   • chip row-action bar  — `flex flex-wrap items-center gap-3 … px-4 py-3`
//   • Step-3 detail list   — `mt-2 flex flex-wrap items-center gap-1.5`
//   • per-show panel list   — `flex flex-col gap-2` (column stack)
//   • alert sub-line        — a plain `<p>` (no flex)
// None is a fixed-height/width parent with stretch-dependent children, so the
// Tailwind-v4-no-default-stretch collapse class the height-equality mandate
// targets cannot occur here. The real-browser height-equality assertion is
// therefore N/A and explicitly deferred in DEFERRED.md (entry "DQ-1").
//
// What CAN go wrong here — and what this jsdom structural test pins:
//   (1) the chip becomes NESTED inside the Publish action (invalid HTML +
//       wrong visual order) instead of a sibling rendered BEFORE it;
//   (2) `items-center` is dropped from the bar — under Tailwind v4 (no default
//       align-items:stretch) the chip + button would no longer share a baseline;
//   (3) `flex-wrap` is dropped — at a narrow (390px) viewport the chip + action
//       would overflow the row instead of wrapping to a second line.
// All three are DOM-structure / className facts that jsdom verifies exactly;
// none needs real layout because none depends on a fixed parent dimension.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import type { DataGapsSummary } from "@/lib/parser/dataGaps";

afterEach(cleanup);

const now = new Date("2026-06-03T12:00:00.000Z");

function gaps(total: number): DataGapsSummary {
  return {
    total,
    classes: { FIELD_UNREADABLE: total, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 },
  };
}

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 4,
    lastSyncedAt: "2026-06-03T10:00:00.000Z",
    lastSyncStatus: "ok",
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

function renderRow() {
  return render(
    <ShowsTable
      rows={[row({ slug: "g", dataGaps: gaps(3) })]}
      now={now}
      activeCount={1}
      overflowCount={0}
      rowAction={(r) => <button data-testid={`publish-${r.slug}`}>Publish</button>}
    />,
  );
}

describe("data-gaps chip row — layout structure (no fixed-dimension-parent risk)", () => {
  it("the chip is a SIBLING rendered BEFORE the action, not nested inside it", () => {
    renderRow();
    const bar = screen.getByTestId("shows-row-action-g");
    const chip = screen.getByTestId("shows-data-gaps-chip-g");
    const action = screen.getByTestId("publish-g");

    // Both are direct children of the bar…
    expect(chip.parentElement).toBe(bar);
    expect(action.parentElement).toBe(bar);
    // …the chip is NOT inside the action (would be invalid + wrong order).
    expect(within(action).queryByTestId("shows-data-gaps-chip-g")).toBeNull();
    // …and the chip comes BEFORE the action in document order.
    expect(
      chip.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(bar.firstElementChild).toBe(chip);
  });

  it("the row-action bar pins items-center + flex-wrap (the stretch/overflow guards)", () => {
    renderRow();
    const bar = screen.getByTestId("shows-row-action-g");
    // items-center: under Tailwind v4 (no default align-items:stretch) this is
    // what keeps the chip + button vertically centered rather than stretched.
    expect(bar.className).toMatch(/\bitems-center\b/);
    // flex-wrap: at 390px the chip + action wrap to a new line instead of
    // overflowing the row.
    expect(bar.className).toMatch(/\bflex-wrap\b/);
    expect(bar.className).toMatch(/\bflex\b/);
  });
});
