// @vitest-environment jsdom
//
// Flow-4 T6 — RecentAutoAppliedStrip: the grouped auto-applied strip (spec §6.2).
// Renders one section per show (group header = showName), rows newest-first with
// the stored `summary` verbatim, an Accept control on EVERY row, an Undo control
// ONLY on undoable rows, per-group "Accept all" (always) + "Undo all" (only when
// undoableIds is non-empty, gated behind an inline confirm mirroring
// ReSyncButton's held-shrink two-button pattern), an overflow line, a null render
// on an empty ok payload, and a bounded infra_error message that never leaks the
// raw "infra_error" token (invariant 5).
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecentAutoAppliedStrip } from "@/components/admin/RecentAutoAppliedStrip";
import type { RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";

afterEach(cleanup);

function noopActions() {
  return {
    acceptChangeAction: vi.fn().mockResolvedValue({ ok: true }),
    acceptAllAction: vi.fn().mockResolvedValue({ ok: true }),
    undoFromDashboardAction: vi.fn().mockResolvedValue({ ok: true }),
  };
}

const FIN_ID = "show-fin";
const RIA_ID = "show-ria";

function okData(): Extract<RecentAutoApplied, { kind: "ok" }> {
  return {
    kind: "ok",
    renderedCount: 4,
    overflowCount: 3,
    rosterShiftByShow: {},
    groups: [
      {
        showId: FIN_ID,
        slug: "fintech",
        showName: "II - FinTech Forum CTO Summit 2026",
        rows: [
          {
            id: "r1",
            changeKind: "crew_added",
            summary: "Crew member Priya Nair added",
            occurredAt: "2026-07-07T10:00:00Z",
            undoable: true,
          },
          {
            id: "r2",
            changeKind: "crew_renamed",
            summary: "Crew member Bob renamed to Robert Chen",
            occurredAt: "2026-07-07T09:00:00Z",
            undoable: true,
          },
          {
            id: "r3",
            changeKind: "field_changed",
            summary: "A field changed on this sync",
            occurredAt: "2026-07-07T08:00:00Z",
            undoable: false,
          },
        ],
        acceptableIds: ["r1", "r2", "r3"],
        undoableIds: ["r1", "r2"],
      },
      {
        showId: RIA_ID,
        slug: "ria",
        showName: "II - RIA Investment Forum - Central 2025",
        rows: [
          {
            id: "r4",
            changeKind: "crew_email_changed",
            summary: "A field changed on this sync · Dana Lee",
            occurredAt: "2026-07-07T05:00:00Z",
            undoable: false,
          },
        ],
        acceptableIds: ["r4"],
        undoableIds: [],
      },
    ],
  };
}

it("renders one section per show, rows in order, with the stored summary verbatim", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);

  // one section per show
  expect(screen.getByTestId(`auto-applied-group-${FIN_ID}`)).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-group-${RIA_ID}`)).toBeInTheDocument();
  expect(screen.getByText("II - FinTech Forum CTO Summit 2026")).toBeInTheDocument();
  expect(screen.getByText("II - RIA Investment Forum - Central 2025")).toBeInTheDocument();

  // summaries rendered verbatim
  expect(screen.getByText("Crew member Priya Nair added")).toBeInTheDocument();
  expect(screen.getByText("Crew member Bob renamed to Robert Chen")).toBeInTheDocument();
  expect(screen.getByText("A field changed on this sync · Dana Lee")).toBeInTheDocument();

  // rows appear newest-first (data-provided order) inside the FinTech group
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  const rowIds = within(fin)
    .getAllByTestId(/^auto-applied-row-/)
    .map((el) => el.getAttribute("data-testid"));
  expect(rowIds).toEqual(["auto-applied-row-r1", "auto-applied-row-r2", "auto-applied-row-r3"]);
});

it("puts an Accept control on EVERY row and an Undo control ONLY on undoable rows", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);

  // ANTI-TAUTOLOGY: scope every query INSIDE the specific row's container so a
  // sibling row's control can never satisfy the assertion.
  const undoableRow = screen.getByTestId("auto-applied-row-r1");
  expect(within(undoableRow).getByTestId("change-feed-accept")).toBeInTheDocument();
  expect(within(undoableRow).getByTestId("change-feed-undo")).toBeInTheDocument();

  const fieldRow = screen.getByTestId("auto-applied-row-r3");
  expect(within(fieldRow).getByTestId("change-feed-accept")).toBeInTheDocument();
  // field_changed is never undoable → NO undo control on this row.
  expect(within(fieldRow).queryByTestId("change-feed-undo")).toBeNull();

  const emailRow = screen.getByTestId("auto-applied-row-r4");
  expect(within(emailRow).getByTestId("change-feed-accept")).toBeInTheDocument();
  expect(within(emailRow).queryByTestId("change-feed-undo")).toBeNull();
});

it("carries the group's showId as a hidden input in every accept form (row + Accept-all)", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);

  // each FinTech row's accept form carries showId=FIN_ID
  for (const rid of ["r1", "r2", "r3"]) {
    const row = screen.getByTestId(`auto-applied-row-${rid}`);
    const showIdInput = row.querySelector('input[name="showId"]') as HTMLInputElement | null;
    expect(showIdInput).not.toBeNull();
    expect(showIdInput).toHaveValue(FIN_ID);
  }

  // Accept-all for the FinTech group also carries showId=FIN_ID plus the joined ids.
  const acceptAll = screen.getByTestId(`auto-applied-accept-all-${FIN_ID}`);
  const allShowId = acceptAll.querySelector('input[name="showId"]') as HTMLInputElement | null;
  expect(allShowId).toHaveValue(FIN_ID);
  const idsInput = acceptAll.querySelector('input[name="ids"]') as HTMLInputElement | null;
  expect(idsInput).toHaveValue("r1,r2,r3");
});

it("always shows Accept all; shows Undo all only when undoableIds is non-empty", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);

  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  const ria = screen.getByTestId(`auto-applied-group-${RIA_ID}`);

  expect(within(fin).getByTestId(`auto-applied-accept-all-${FIN_ID}`)).toBeInTheDocument();
  expect(within(ria).getByTestId(`auto-applied-accept-all-${RIA_ID}`)).toBeInTheDocument();

  // FinTech has undoableIds → Undo all present; RIA has none → absent.
  expect(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`)).toBeInTheDocument();
  expect(within(ria).queryByTestId(`auto-applied-undo-all-${RIA_ID}`)).toBeNull();
});

it("gates Undo all behind a confirm step, then dispatches undo for each undoableId", async () => {
  const actions = noopActions();
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} />);

  // Scope everything to the FinTech group (anti-tautology).
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));

  // CONFIRM GATE: after the first click, the confirm panel appears and NO undo has
  // fired yet (mirrors ReSyncButton's held-shrink two-button gate).
  const confirmPanel = within(fin).getByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`);
  expect(confirmPanel).toBeInTheDocument();
  expect(actions.undoFromDashboardAction).not.toHaveBeenCalled();

  // Confirm → dispatches undoFromDashboardAction once per undoableId (r1, r2).
  await act(async () => {
    fireEvent.click(within(confirmPanel).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  });
  await waitFor(() => {
    expect(actions.undoFromDashboardAction).toHaveBeenCalledTimes(2);
  });
});

it("moves focus to the safe 'Keep changes' control when the Undo-all confirm opens", async () => {
  // WCAG 2.4.3 + accidental-bulk-undo safety: the destructive confirm must not
  // land keyboard focus on the destructive button. Mirrors ReSyncButton.
  const actions = noopActions();
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} />);

  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));

  const cancelBtn = within(fin).getByTestId(`auto-applied-undo-all-cancel-${FIN_ID}`);
  await waitFor(() => expect(cancelBtn).toHaveFocus());
});

it("renders the overflow line when overflowCount > 0", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const overflow = screen.getByTestId("auto-applied-overflow");
  expect(overflow).toHaveTextContent("+3 older changes not shown");
  // it is plain text, not a button
  expect(within(overflow).queryByRole("button")).toBeNull();
});

it("renders nothing when ok with zero groups", () => {
  const empty: RecentAutoApplied = {
    kind: "ok",
    groups: [],
    renderedCount: 0,
    overflowCount: 0,
    rosterShiftByShow: {},
  };
  const { container } = render(<RecentAutoAppliedStrip data={empty} actions={noopActions()} />);
  expect(container).toBeEmptyDOMElement();
});

it("renders a bounded infra_error message that never leaks the raw code", () => {
  const data: RecentAutoApplied = {
    kind: "infra_error",
    message: "show_change_log read failed: connection refused",
  };
  render(<RecentAutoAppliedStrip data={data} actions={noopActions()} />);
  expect(screen.getByTestId("auto-applied-error")).toBeInTheDocument();
  // invariant 5: neither the raw kind token nor the internal message leaks.
  expect(screen.queryByText(/infra_error/)).toBeNull();
  expect(screen.queryByText(/connection refused/)).toBeNull();
});
