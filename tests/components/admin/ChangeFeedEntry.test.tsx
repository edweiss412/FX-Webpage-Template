// @vitest-environment jsdom
//
// Phase 6 T6.5 — ChangeFeedEntry row shell + mode dispatch. Failure modes:
//  (a) a `none`-action row renders an Undo button (undo offered for a change with
//      no captured prior state — F6);
//  (b) a `pending` row renders Undo instead of Approve/Reject;
//  (c) the summary label assertion is satisfied by a sibling control rather than
//      the entry's own summary node (anti-tautology).
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ChangeFeedEntry } from "@/components/admin/ChangeFeedEntry";

afterEach(cleanup);

const base = { id: "e1", occurredAt: "2026-06-09T11:00:00Z", entityRef: "Alice" };
const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();

it("auto_applied crew row offers Undo, no Approve/Reject", () => {
  render(
    <ChangeFeedEntry
      entry={{
        ...base,
        status: "applied",
        action: "undo",
        summary: "Removed Alice",
        changeLogId: "cl-1",
      }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  // anti-tautology: scope to the entry's OWN summary node, not the whole row
  const row = screen.getByTestId("change-feed-entry-e1");
  const summary = within(row).getByTestId("change-feed-summary");
  expect(summary).toHaveTextContent("Removed Alice");
  expect(within(row).getByTestId("change-feed-undo")).toBeInTheDocument();
  expect(within(row).queryByTestId("mi11-approve")).toBeNull();
});

it("notification-only (none) row offers NO action button", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "none", summary: "Section shrank" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByRole("button")).toBeNull();
});

it("superseded row renders the muted badge and NO action (PF21)", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "superseded", action: "none", summary: "Removed Alice" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  // the "Superseded" badge renders (stable UI label, no raw status string)
  expect(within(row).getByText("Superseded")).toBeInTheDocument();
  // an inert/replaced entry never offers Undo or Approve/Reject
  expect(within(row).queryByRole("button")).toBeNull();
});

it("pending MI-11 row renders old→new from entry.summary and mounts Approve/Reject bound to gate.holdId, no Undo", () => {
  const approve = vi.fn();
  render(
    <ChangeFeedEntry
      entry={{
        ...base,
        status: "pending",
        action: "approve_reject",
        // PF17: the old→new text IS the summary (Phase 5 server-renders it).
        summary: "Email change for Alice: a@old → a@new",
        // PF14/PF40: the canonical FeedEntry carries gate {holdId, disposition,
        // baseModifiedTime} — Phase 5 populates it; the page does NO second query.
        gate: {
          holdId: "h1",
          disposition: { disposition: "email_change", name: "Alice", email: "a@new" },
          baseModifiedTime: "2026-06-09T10:00:00Z",
        },
      }}
      now={now}
      undoAction={noop}
      approveAction={approve}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-undo")).toBeNull();
  // anti-tautology: the old→new text lives in the entry's OWN summary node.
  expect(within(row).getByTestId("change-feed-summary")).toHaveTextContent(
    "Email change for Alice: a@old → a@new",
  );
  // the Approve form carries the holdId from entry.gate (hidden input), so the
  // bound action targets the right hold with no extra lookup.
  const holdInputs = within(row)
    .getAllByDisplayValue("h1")
    .filter((el) => el.getAttribute("name") === "holdId");
  expect(holdInputs.length).toBeGreaterThanOrEqual(1);
  // PF40: the feed-rendered baseModifiedTime is threaded VERBATIM into the gate
  // forms as the expectedBaseModifiedTime staleness token (one per form).
  const tokenInputs = within(row).getAllByDisplayValue("2026-06-09T10:00:00Z");
  expect(tokenInputs).toHaveLength(2);
  for (const el of tokenInputs) {
    expect(el).toHaveAttribute("name", "expectedBaseModifiedTime");
  }
});

it("undo row wires the Undo button to entry.changeLogId", () => {
  render(
    <ChangeFeedEntry
      entry={{
        ...base,
        status: "applied",
        action: "undo",
        summary: "Removed Alice",
        changeLogId: "cl-9",
      }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).getByTestId("change-feed-undo")).toBeInTheDocument();
  // PF14: the Undo form's hidden changeLogId input comes straight from
  // entry.changeLogId (Phase 5 populated), not a derived/looked-up value.
  expect(within(row).getByDisplayValue("cl-9")).toBeInTheDocument();
});

it("defensively renders notification-only when approve_reject lacks gate (no dangling Approve)", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "pending", action: "approve_reject", summary: "Email change" }}
      now={now}
      undoAction={noop}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("mi11-approve")).toBeNull();
  expect(within(row).queryByTestId("change-feed-undo")).toBeNull();
});
