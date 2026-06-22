// @vitest-environment jsdom
//
// Phase 6 T6.6 — ChangesFeed list + cap/truncation disclosure. Failure modes:
//  (a) list not rendered in array order (Phase 5 owns ordering; this only pins
//      the component preserves it);
//  (b) truncated feed silently cuts with no "older changes not shown" note;
//  (c) empty feed renders nothing/raw error instead of a calm empty state.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChangesFeed } from "@/components/admin/ChangesFeed";

afterEach(cleanup);

const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();
const mk = (id: string, t: string) => ({
  id,
  occurredAt: t,
  status: "applied" as const,
  action: "none" as const,
  summary: `change ${id}`,
  entityRef: null,
});

it("renders entries in array order and shows the truncation note when capped", () => {
  render(
    <ChangesFeed
      entries={[mk("b", "2026-06-09T11:00:00Z"), mk("a", "2026-06-09T09:00:00Z")]}
      truncated
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const rows = screen.getAllByTestId(/change-feed-entry-/);
  expect(rows[0]).toHaveAttribute("data-testid", "change-feed-entry-b"); // array order preserved (newest first per Phase 5)
  expect(screen.getByTestId("change-feed-truncation")).toHaveTextContent(
    /older changes not shown/i,
  );
});

it("does NOT render the truncation note when not truncated", () => {
  render(
    <ChangesFeed
      entries={[mk("b", "2026-06-09T11:00:00Z")]}
      truncated={false}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.queryByTestId("change-feed-truncation")).toBeNull();
});

it("shows a calm empty state when there are no entries", () => {
  render(
    <ChangesFeed
      entries={[]}
      truncated={false}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.getByTestId("change-feed-empty")).toBeInTheDocument();
  expect(screen.queryByTestId(/change-feed-entry-/)).toBeNull();
});
