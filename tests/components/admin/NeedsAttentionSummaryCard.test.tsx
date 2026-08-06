// @vitest-environment jsdom
// Mobile needs-attention Task 7 — NeedsAttentionSummaryCard (spec §4.5).
// Anti-tautology: EVERY query is scoped to [data-testid=needs-attention-summary-card]
// via `within(card)` / card.querySelector — nothing here can be satisfied by a
// sibling that independently renders the same labels.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NeedsAttentionSummaryCard } from "@/components/admin/NeedsAttentionSummaryCard";

afterEach(() => {
  cleanup();
});

function renderCard(props: {
  totalCount: number;
  ingestionTotal: number;
  syncTotal: number;
  syncProblemTotal?: number;
  identityHoldTotal?: number;
  autoAppliedCount?: number;
}) {
  render(<NeedsAttentionSummaryCard syncProblemTotal={0} identityHoldTotal={0} {...props} />);
  return screen.getByTestId("needs-attention-summary-card");
}

describe("NeedsAttentionSummaryCard", () => {
  it("totalCount 0 → 'All caught up' + a sub-line that TEACHES + link still points at the page", () => {
    const card = renderCard({ totalCount: 0, ingestionTotal: 0, syncTotal: 0 });
    expect(within(card).getByText("All caught up")).toBeInTheDocument();
    // The sub-line must say something the headline does not. Asserting the new
    // copy AND the absence of the old restatement keeps the dedup from being
    // undone by a well-meaning copy edit.
    expect(within(card).getByText("Sheets that need a look show up here.")).toBeInTheDocument();
    expect(within(card).queryByText("Nothing waiting on you.")).toBeNull();
    // The zero state stays a link to the page (spec §4.5 — no dead-end card).
    expect(card).toHaveAttribute("href", "/admin/needs-attention");
    // Count branch absent in the zero state.
    expect(card.textContent).not.toContain("Needs attention");
  });

  it("78 total / 31 ingestions / 47 syncs → headline + both chips (exact stream totals)", () => {
    const card = renderCard({ totalCount: 78, ingestionTotal: 31, syncTotal: 47 });
    // Headline is split across spans ("Needs attention · " + tabular "78") —
    // assert on the card's combined text, still scoped to the card only.
    expect(card.textContent).toContain("Needs attention · 78");
    const ingestionChip = within(card).getByTestId("summary-chip-ingestions");
    expect(ingestionChip).toHaveTextContent("31 couldn't process");
    const syncChip = within(card).getByTestId("summary-chip-syncs");
    expect(syncChip).toHaveTextContent("47 to review");
    expect(card).toHaveAttribute("href", "/admin/needs-attention");
  });

  it("ingestionTotal 0 / syncTotal 5 → ingestion chip ABSENT, sync chip present", () => {
    const card = renderCard({ totalCount: 5, ingestionTotal: 0, syncTotal: 5 });
    expect(within(card).queryByTestId("summary-chip-ingestions")).toBeNull();
    expect(within(card).getByTestId("summary-chip-syncs")).toHaveTextContent("5 to review");
  });

  it("ingestionTotal 4 / syncTotal 0 → sync chip ABSENT, ingestion chip present", () => {
    const card = renderCard({ totalCount: 4, ingestionTotal: 4, syncTotal: 0 });
    expect(within(card).queryByTestId("summary-chip-syncs")).toBeNull();
    expect(within(card).getByTestId("summary-chip-ingestions")).toHaveTextContent(
      "4 couldn't process",
    );
  });

  // ── Mobile auto-applied parity (Task 4): the "N auto-applied" chip ─────────

  it("autoAppliedCount 3 → 'summary-chip-auto-applied' reads '3 auto-applied'", () => {
    const card = renderCard({
      totalCount: 5,
      ingestionTotal: 0,
      syncTotal: 0,
      autoAppliedCount: 3,
    });
    expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent(
      "3 auto-applied",
    );
  });

  it("autoAppliedCount 0 / negative / NaN → chip ABSENT", () => {
    for (const v of [0, -2, Number.NaN]) {
      const card = renderCard({
        totalCount: 5,
        ingestionTotal: 0,
        syncTotal: 0,
        autoAppliedCount: v,
      });
      expect(within(card).queryByTestId("summary-chip-auto-applied")).toBeNull();
      cleanup();
    }
  });

  it("autoAppliedCount OMITTED (undefined) → chip ABSENT (optional-prop path)", () => {
    const card = renderCard({ totalCount: 5, ingestionTotal: 0, syncTotal: 0 });
    expect(within(card).queryByTestId("summary-chip-auto-applied")).toBeNull();
  });

  it("totalCount 0 but autoAppliedCount 4 → NOT 'All caught up'; title without '· 0'; only the auto-applied chip", () => {
    const card = renderCard({
      totalCount: 0,
      ingestionTotal: 0,
      syncTotal: 0,
      autoAppliedCount: 4,
    });
    expect(within(card).queryByText("All caught up")).toBeNull();
    expect(card.textContent).toContain("Needs attention");
    expect(card.textContent).not.toContain("· 0");
    expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent(
      "4 auto-applied",
    );
    expect(within(card).queryByTestId("summary-chip-ingestions")).toBeNull();
  });

  it("totalCount 6 + autoAppliedCount 2 → title count + auto-applied chip together", () => {
    const card = renderCard({
      totalCount: 6,
      ingestionTotal: 6,
      syncTotal: 0,
      autoAppliedCount: 2,
    });
    expect(card.textContent).toContain("Needs attention · 6");
    expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent(
      "2 auto-applied",
    );
  });

  it("card meets the tap target (min-h-tap-min) and renders the chevron", () => {
    const card = renderCard({ totalCount: 3, ingestionTotal: 1, syncTotal: 2 });
    expect(card.className).toMatch(/\bmin-h-tap-min\b/);
    const chevron = card.querySelector("svg.lucide-chevron-right");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden", "true");
  });
});

// ── Holds rollup Task 7: the fourth chip. `renderCard` defaults
// identityHoldTotal to 0, so every case above still exercises the absent state.
describe("NeedsAttentionSummaryCard held-changes chip", () => {
  it("identityHoldTotal 2 → '2 held' chip with a self-describing accessible name", () => {
    const card = renderCard({
      totalCount: 2,
      ingestionTotal: 0,
      syncTotal: 0,
      identityHoldTotal: 2,
    });
    const chip = within(card).getByTestId("summary-chip-identity-holds");
    expect(chip).toHaveTextContent("2 held");
    expect(chip).toHaveAttribute("aria-label", "2 held identity changes");
  });

  it("identityHoldTotal 0 → chip absent", () => {
    const card = renderCard({ totalCount: 1, ingestionTotal: 1, syncTotal: 0 });
    expect(within(card).queryByTestId("summary-chip-identity-holds")).toBeNull();
  });

  it("holds-only state still renders a breakdown (spec G2: never an empty chip row)", () => {
    const card = renderCard({
      totalCount: 3,
      ingestionTotal: 0,
      syncTotal: 0,
      identityHoldTotal: 3,
    });
    expect(card.textContent).toContain("Needs attention · 3");
    expect(within(card).getByTestId("summary-chip-identity-holds")).toHaveTextContent("3 held");
  });
});
