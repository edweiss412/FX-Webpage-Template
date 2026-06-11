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

function renderCard(props: { totalCount: number; ingestionTotal: number; syncTotal: number }) {
  render(<NeedsAttentionSummaryCard {...props} />);
  return screen.getByTestId("needs-attention-summary-card");
}

describe("NeedsAttentionSummaryCard", () => {
  it("totalCount 0 → 'All caught up' + 'Nothing waiting on you.' + link still points at the page", () => {
    const card = renderCard({ totalCount: 0, ingestionTotal: 0, syncTotal: 0 });
    expect(within(card).getByText("All caught up")).toBeInTheDocument();
    expect(within(card).getByText("Nothing waiting on you.")).toBeInTheDocument();
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

  it("card meets the tap target (min-h-tap-min) and renders the chevron", () => {
    const card = renderCard({ totalCount: 3, ingestionTotal: 1, syncTotal: 2 });
    expect(card.className).toMatch(/\bmin-h-tap-min\b/);
    const chevron = card.querySelector("svg.lucide-chevron-right");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden", "true");
  });
});
