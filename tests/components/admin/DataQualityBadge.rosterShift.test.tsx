// @vitest-environment jsdom
// Flow 4.3 (spec §6.4/§6.5) — DataQualityBadge folds an optional roster-shift
// input alongside the existing parse-data-gap input. The badge lights amber iff
// `(dataGaps?.total ?? 0) > 0 || (rosterShift?.total ?? 0) > 0`, and its
// accessible name concatenates the roster segment (omitting zero-count
// sub-segments) THEN the unchanged gap breakdown, per §6.5's exact strings.
//
// Anti-tautology: we render the badge directly against its PROP inputs (not a
// container that also renders the counts elsewhere) and derive the gap portion
// of every expected label from `formatDataGapBreakdown(fixture)`, never a
// hardcoded breakdown string.
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

describe("DataQualityBadge — roster-shift input (Flow 4.3, spec §6.4/§6.5)", () => {
  it("roster-only (no dataGaps) renders amber with the §6.5 roster segment", () => {
    // {added:1, removed:0, renamed:1} → zero-count `removed` omitted.
    render(
      <DataQualityBadge
        slug="a"
        rosterShift={roster({ added: 1, renamed: 1 })}
        dataGaps={undefined}
      />,
    );
    const el = screen.getByRole("img");
    expect(el).toHaveAttribute(
      "aria-label",
      "Roster changed since last review: 1 added, 1 renamed",
    );
  });

  it("roster-only keeps registry order added→removed→renamed, omitting zero segments", () => {
    render(<DataQualityBadge slug="b" rosterShift={roster({ removed: 2 })} dataGaps={undefined} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Roster changed since last review: 2 removed",
    );
  });

  it("data-gap-only keeps the existing label unchanged (no roster prefix)", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(<DataQualityBadge slug="c" dataGaps={dg} />);
    const expected = `${dg.total} data ${dg.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(dg)}`;
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expected);
  });

  it("both inputs → roster segment THEN gap breakdown, concatenated per §6.5", () => {
    const dg = mkDataGaps({ UNKNOWN_FIELD: 3 });
    render(
      <DataQualityBadge slug="d" rosterShift={roster({ added: 1, renamed: 1 })} dataGaps={dg} />,
    );
    const gapPart = `${dg.total} data ${dg.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(dg)}`;
    const expected = `Roster changed since last review: 1 added, 1 renamed. ${gapPart}`;
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expected);
  });

  it("neither input (both undefined) → renders nothing", () => {
    const { container } = render(<DataQualityBadge slug="e" dataGaps={undefined} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("rosterShift.total 0 and dataGaps undefined → renders nothing", () => {
    const { container } = render(
      <DataQualityBadge slug="f" rosterShift={roster({ total: 0 })} dataGaps={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("rosterShift.total 0 and dataGaps.total 0 → renders nothing", () => {
    const { container } = render(
      <DataQualityBadge slug="g" rosterShift={roster({ total: 0 })} dataGaps={mkDataGaps({})} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
