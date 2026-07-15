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
const acceptNoop = vi.fn(async () => ({ ok: true as const, count: 1 }));
const mk = (id: string, t: string) => ({
  id,
  occurredAt: t,
  status: "applied" as const,
  action: "none" as const,
  summary: `change ${id}`,
  entityRef: null,
  acceptable: false,
  acknowledgedAt: null,
});

it("renders entries in array order and shows the truncation note when capped", () => {
  render(
    <ChangesFeed
      entries={[mk("b", "2026-06-09T11:00:00Z"), mk("a", "2026-06-09T09:00:00Z")]}
      truncated
      now={now}
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
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
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
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
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.getByTestId("change-feed-empty")).toBeInTheDocument();
  expect(screen.queryByTestId(/change-feed-entry-/)).toBeNull();
});

// ── Accept-all header control (spec 2026-07-15 §4.2) ────────────────────────
// Failure modes: Accept-all rendered with zero acceptable rows (or disabled
// ghost); count/ids hardcoded instead of derived from the acceptable subset;
// non-acceptable ids leaking into the payload.

it("Accept all (N) renders iff >=1 acceptable entry; ids = exactly the acceptable entry ids in feed order", () => {
  const entries = [
    { ...mk("n1", "2026-06-09T11:00:00Z") },
    { ...mk("a1", "2026-06-09T10:00:00Z"), acceptable: true },
    { ...mk("a2", "2026-06-09T09:00:00Z"), acceptable: true },
  ];
  render(
    <ChangesFeed
      entries={entries}
      truncated={false}
      now={now}
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  // label count derived from the fixture's acceptable subset (2 of 3)
  const expectedIds = entries.filter((e) => e.acceptable).map((e) => e.id);
  expect(
    screen.getByRole("button", { name: `Accept all (${expectedIds.length})` }),
  ).toBeInTheDocument();
  const idsInput = document.querySelector('input[name="ids"]');
  expect(idsInput).toHaveAttribute("value", expectedIds.join(","));
  const showInput = document.querySelector('input[name="showId"][value="show-1"]');
  expect(showInput).not.toBeNull();
});

it("zero acceptable entries → no Accept-all control at all (not a disabled button)", () => {
  render(
    <ChangesFeed
      entries={[mk("n1", "2026-06-09T11:00:00Z")]}
      truncated={false}
      now={now}
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.queryByRole("button", { name: /accept all/i })).toBeNull();
});

it("heading reads exactly 'Sheet changes' with a stable id", () => {
  render(
    <ChangesFeed
      entries={[]}
      truncated={false}
      now={now}
      showId="show-1"
      undoAction={noop}
      acceptAction={acceptNoop}
      acceptAllAction={acceptNoop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const heading = document.getElementById("admin-changes-feed-heading");
  expect(heading?.textContent).toBe("Sheet changes");
});
