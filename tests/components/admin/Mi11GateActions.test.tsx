// @vitest-environment jsdom
//
// Phase 6 T6.4 — Mi11GateActions. Failure modes:
//  (a) reads a non-canonical detail/groupState/conflictCode prop the Phase-5
//      FeedEntry doesn't produce (forces a 2nd query — PF14/PF17);
//  (b) the IDENTITY_WOULD_COLLIDE conflict is pre-rendered statically instead of
//      surfacing from the Approve action's typed result after submit;
//  (c) the Approve form isn't bound to gate.holdId;
//  (d) PF40: the Approve/Reject forms drop the feed-rendered baseModifiedTime
//      staleness token (or re-derive it) → the Phase 2 retarget guard is vacuous.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Mi11GateActions } from "@/components/admin/Mi11GateActions";

afterEach(cleanup);

const noop = vi.fn();

it("renders Approve + Reject for a pending hold from gate (no detail/groupState props)", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      baseModifiedTime="2026-06-09T10:00:00Z"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  // PF17: the row's old→new text is the entry SUMMARY (server-rendered by Phase 5
  // via lib/messages) and lives on ChangeFeedEntry, NOT here — this component only
  // owns the Approve/Reject forms bound to gate.holdId.
  expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  // both forms carry the holdId (hidden input) so each bound action targets the
  // hold — Approve and Reject each need it (PF40 carries holdId per form).
  const holdInputs = screen
    .getAllByDisplayValue("h1")
    .filter((el) => el.getAttribute("name") === "holdId");
  expect(holdInputs).toHaveLength(2);
});

it("carries the feed-rendered baseModifiedTime staleness token into BOTH the Approve and Reject submissions (PF40)", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      baseModifiedTime="2026-06-09T10:00:00Z"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const tokenInputs = screen.getAllByDisplayValue("2026-06-09T10:00:00Z");
  expect(tokenInputs).toHaveLength(2); // one per form (Approve + Reject)
  for (const el of tokenInputs) {
    expect(el).toHaveAttribute("name", "expectedBaseModifiedTime");
  }
});

it("renders an empty expectedBaseModifiedTime when baseModifiedTime is null (round-trips as '')", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "removal" }}
      baseModifiedTime={null}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  const tokenInputs = screen
    .getAllByDisplayValue("")
    .filter((el) => el.getAttribute("name") === "expectedBaseModifiedTime");
  // the two expectedBaseModifiedTime inputs are present and empty (not absent)
  expect(tokenInputs).toHaveLength(2);
});

it("surfaces an IDENTITY_WOULD_COLLIDE conflict POST-SUBMIT from the action result, via lib/messages (no raw code)", async () => {
  // PF17: collision/swap outcomes are NOT pre-rendered. The Approve action returns
  // its typed result; the component shows the conflict message after submit.
  const approveAction = vi.fn().mockResolvedValue({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      baseModifiedTime="2026-06-09T10:00:00Z"
      approveAction={approveAction}
      rejectAction={noop}
    />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
  });
  // ErrorExplainer renders the catalog copy for the code; the raw code never
  // appears in the DOM (invariant 5).
  expect(await screen.findByTestId("mi11-gate-result")).toBeInTheDocument();
  expect(screen.queryByText("IDENTITY_WOULD_COLLIDE")).toBeNull();
});

it("disambiguates Approve/Reject accessible names with the disposition name (WCAG 2.5.3)", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "rename", name: "Alice", email: "a@new" }}
      baseModifiedTime="2026-06-09T10:00:00Z"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.getByRole("button", { name: /approve change for alice/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reject change for alice/i })).toBeInTheDocument();
});
