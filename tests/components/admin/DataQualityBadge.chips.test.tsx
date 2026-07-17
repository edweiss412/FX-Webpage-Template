// @vitest-environment jsdom
// FLOW4-2 + FLOW4-3 — the badge now renders up to two VISIBLE glyph+count chips
// (roster `Users` THEN gap `TriangleAlert`), dissolving the hover-only dependency
// and distinguishing the two signals for sighted touch/keyboard users. The
// aria-label / title / role="img" / data-testid contract is byte-preserved.
//
// Anti-tautology: counts are derived from each fixture's `.total` (never a literal);
// each chip is scoped by its own data-testid so a chip cannot pass by a sibling's
// glyph; the aria-label assertions derive the gap portion from formatDataGapBreakdown.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DataQualityBadge } from "@/components/admin/DataQualityBadge";
import type { RosterShiftSummary } from "@/lib/admin/showDisplay";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import { mkDataGaps } from "../../helpers/dataGapsFixture";

afterEach(cleanup);

function roster(p: Partial<RosterShiftSummary>): RosterShiftSummary {
  const added = p.added ?? 0;
  const removed = p.removed ?? 0;
  const renamed = p.renamed ?? 0;
  return { added, removed, renamed, total: p.total ?? added + removed + renamed };
}

describe("DataQualityBadge — visible glyph+count chips (FLOW4-2/3)", () => {
  it("gap-only: exactly the gap chip (TriangleAlert), count === dataGaps.total, no roster chip", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(<DataQualityBadge slug="g" dataGaps={dg} />);
    const gap = screen.getByTestId("dq-chip-gap");
    expect(gap).toHaveTextContent(String(dg.total)); // derived, not literal
    expect(gap.querySelector("svg.lucide-triangle-alert")).not.toBeNull();
    expect(screen.queryByTestId("dq-chip-roster")).toBeNull();
  });

  it("roster-only: exactly the roster chip (Users), count === rosterShift.total, no gap chip", () => {
    const rs = roster({ added: 2, renamed: 1 }); // total 3
    render(<DataQualityBadge slug="r" rosterShift={rs} dataGaps={undefined} />);
    const rosterChip = screen.getByTestId("dq-chip-roster");
    expect(rosterChip).toHaveTextContent(String(rs.total));
    expect(rosterChip.querySelector("svg.lucide-users")).not.toBeNull();
    expect(screen.queryByTestId("dq-chip-gap")).toBeNull();
  });

  it("both: roster chip precedes gap chip in DOM order; counts match their fixture totals", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    const rs = roster({ added: 1, renamed: 1 }); // total 2
    render(<DataQualityBadge slug="b" rosterShift={rs} dataGaps={dg} />);
    const rosterChip = screen.getByTestId("dq-chip-roster");
    const gapChip = screen.getByTestId("dq-chip-gap");
    expect(rosterChip).toHaveTextContent(String(rs.total));
    expect(gapChip).toHaveTextContent(String(dg.total));
    // roster BEFORE gap (Node.DOCUMENT_POSITION_FOLLOWING === 4)
    expect(rosterChip.compareDocumentPosition(gapChip) & 4).toBeTruthy();
  });

  it("0/0: renders nothing", () => {
    const { container } = render(
      <DataQualityBadge slug="z" dataGaps={mkDataGaps({})} rosterShift={roster({ total: 0 })} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([NaN, -1, Infinity])(
    "hardened gate: lone non-signal total %p on either input renders nothing",
    (bad) => {
      const r1 = render(
        <DataQualityBadge slug="rn" rosterShift={roster({ total: bad })} dataGaps={undefined} />,
      );
      expect(r1.container).toBeEmptyDOMElement();
      cleanup();
      const dgBad = { ...mkDataGaps({ UNKNOWN_FIELD: 1 }), total: bad };
      const r2 = render(<DataQualityBadge slug="gn" dataGaps={dgBad} />);
      expect(r2.container).toBeEmptyDOMElement();
    },
  );

  it("aria-label / role=img / data-testid contract byte-preserved (both inputs, §6.5 order)", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(
      <DataQualityBadge slug="c" rosterShift={roster({ added: 1, renamed: 1 })} dataGaps={dg} />,
    );
    const gapPart = `${dg.total} data ${dg.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(dg)}`;
    const expected = `Roster changed since last review: 1 added, 1 renamed. ${gapPart}`;
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", expected);
    expect(img).toHaveAttribute("title", expected);
    expect(img).toHaveAttribute("data-testid", "shows-data-quality-c");
  });
});
