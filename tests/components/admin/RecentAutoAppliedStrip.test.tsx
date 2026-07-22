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
import type { AutoAppliedRow, RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";

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
            diff: { kind: "single", caption: "Added", value: "Priya Nair" },
          },
          {
            id: "r2",
            changeKind: "crew_renamed",
            summary: "Crew member Bob renamed to Robert Chen",
            occurredAt: "2026-07-07T09:00:00Z",
            undoable: true,
            diff: { kind: "fromTo", from: "Bob", to: "Robert Chen" },
          },
          {
            id: "r3",
            changeKind: "field_changed",
            summary: "A field changed on this sync",
            occurredAt: "2026-07-07T08:00:00Z",
            undoable: false,
            diff: { kind: "none" },
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
            diff: { kind: "none" },
          },
        ],
        acceptableIds: ["r4"],
        undoableIds: [],
      },
    ],
  };
}

it("collapses every group by default (dashboard): panel present-but-inert, count shown", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const toggle = screen.getByTestId(`auto-applied-toggle-${FIN_ID}`);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // aria-controls is now unconditional (region always mounted)
  expect(toggle).toHaveAttribute("aria-controls", `auto-applied-panel-${FIN_ID}`);
  // count badge shows even while collapsed (it lives in the header toggle)
  expect(screen.getByTestId(`auto-applied-count-${FIN_ID}`)).toHaveTextContent("3");
  // panel region is always mounted but inert while collapsed (height-morph)
  const region = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  expect(region).toHaveAttribute("inert");
  // rows are present in the DOM (inside the inert region), not unmounted
  expect(screen.getByTestId("auto-applied-row-r1")).toBeInTheDocument();
});

it("expanding a group clears inert on its panel region", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`));
  const region = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  expect(region).not.toHaveAttribute("inert");
  expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

it("expands a group on toggle click: panel region flips inert->active, aria-expanded flips", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const toggle = screen.getByTestId(`auto-applied-toggle-${FIN_ID}`);
  const region = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  // before click: region inert (real reveal signal, not mere presence — rows are
  // always mounted now)
  expect(region).toHaveAttribute("inert");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(region).not.toHaveAttribute("inert");
  expect(screen.getByTestId("auto-applied-row-r1")).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-accept-all-${FIN_ID}`)).toBeInTheDocument();
});

it("renders groups expanded when defaultExpanded is set (show-page usage)", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByTestId("auto-applied-row-r1")).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-accept-all-${FIN_ID}`)).toBeInTheDocument();
});

it("places bulk Accept all / Undo all below the header, never inside the toggle button", () => {
  // "Underneath the show name, not in the same row" + interactive controls must
  // never nest inside the toggle <button> (a11y: <button> takes phrasing content).
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const toggle = screen.getByTestId(`auto-applied-toggle-${FIN_ID}`);
  const acceptAll = screen.getByTestId(`auto-applied-accept-all-${FIN_ID}`);
  const undoAll = screen.getByTestId(`auto-applied-undo-all-${FIN_ID}`);
  expect(toggle.contains(acceptAll)).toBe(false);
  expect(toggle.contains(undoAll)).toBe(false);
  const panel = screen.getByTestId(`auto-applied-panel-${FIN_ID}`);
  expect(panel.contains(acceptAll)).toBe(true);
  expect(panel.contains(undoAll)).toBe(true);
});

it("renders one section per show, rows in data order", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);

  // one section per show
  expect(screen.getByTestId(`auto-applied-group-${FIN_ID}`)).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-group-${RIA_ID}`)).toBeInTheDocument();
  expect(screen.getByText("II - FinTech Forum CTO Summit 2026")).toBeInTheDocument();
  expect(screen.getByText("II - RIA Investment Forum - Central 2025")).toBeInTheDocument();

  // rows appear newest-first (data-provided order) inside the FinTech group
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  const rowIds = within(fin)
    .getAllByTestId(/^auto-applied-row-/)
    .map((el) => el.getAttribute("data-testid"));
  expect(rowIds).toEqual(["auto-applied-row-r1", "auto-applied-row-r2", "auto-applied-row-r3"]);
});

it("renders crew changes as From→To / single-value diffs and none-rows as summary", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  // fromTo (r2): To value emphasized/not struck; From value struck — scoped to the row.
  const renamed = screen.getByTestId("auto-applied-row-r2");
  expect(within(renamed).getByText("Robert Chen").className).not.toMatch(/line-through/);
  expect(within(renamed).getByText("Bob").className).toMatch(/line-through/);
  // single Added (r1): value present, not struck.
  const added = screen.getByTestId("auto-applied-row-r1");
  expect(within(added).getByText("Priya Nair").className).not.toMatch(/line-through/);
  // none rows (r3 field, r4 email): verbatim summary preserved.
  expect(
    within(screen.getByTestId("auto-applied-row-r3")).getByText("A field changed on this sync"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByTestId("auto-applied-row-r4")).getByText(
      "A field changed on this sync · Dana Lee",
    ),
  ).toBeInTheDocument();
});

it("lays out buttons in a stretch grid: 2 cols (w-full accept+undo) when undoable, 1 col when not", () => {
  // Pins the dimensional-invariant MECHANISM (spec §6): the full/half width comes
  // from a CSS-grid template (grid-cols-2 = two equal 1fr cells) + w-full buttons,
  // NOT fragile flex stretch. Real-browser width-distribution is deferred
  // (BL-AUTOAPPLIED-CARD-LAYOUT-E2E) since 1fr columns split equally by grid spec.
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const undoable = screen.getByTestId("auto-applied-row-r1"); // crew_added, undoable
  const uGrid = within(undoable).getByTestId("change-feed-accept").closest("div.grid")!;
  expect(uGrid.className).toMatch(/grid-cols-2/);
  expect(within(undoable).getByTestId("change-feed-accept").className).toMatch(/\bw-full\b/);
  expect(within(undoable).getByTestId("change-feed-undo").className).toMatch(/\bw-full\b/);

  const notUndoable = screen.getByTestId("auto-applied-row-r3"); // field_changed, not undoable
  const nGrid = within(notUndoable).getByTestId("change-feed-accept").closest("div.grid")!;
  expect(nGrid.className).toMatch(/grid-cols-1/);
  expect(within(notUndoable).queryByTestId("change-feed-undo")).toBeNull();
});

it("shows a per-group count badge = rendered rows", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  expect(
    within(screen.getByTestId(`auto-applied-group-${FIN_ID}`)).getByTestId(
      `auto-applied-count-${FIN_ID}`,
    ),
  ).toHaveTextContent("3");
  expect(
    within(screen.getByTestId(`auto-applied-group-${RIA_ID}`)).getByTestId(
      `auto-applied-count-${RIA_ID}`,
    ),
  ).toHaveTextContent("1");
});

// ── COLLAPSE-1: collapsed-header kind-dot cluster ──────────────────────────
// helper to build a single-group fixture with the given change kinds
function groupData(kinds: string[]): RecentAutoApplied {
  return {
    kind: "ok",
    renderedCount: kinds.length,
    overflowCount: 0,
    rosterShiftByShow: {},
    groups: [
      {
        showId: "g",
        slug: "g",
        showName: "G",
        acceptableIds: kinds.map((_, i) => `k${i}`),
        undoableIds: [],
        rows: kinds.map((k, i) => ({
          id: `k${i}`,
          changeKind: k,
          summary: "s",
          occurredAt: "2026-07-07T00:00:00Z",
          undoable: false,
          diff: { kind: "none" as const },
        })),
      },
    ],
  };
}

it("collapsed header shows a kind-dot cluster: one dot per distinct kind, labeled", () => {
  // FIN group has crew_added + crew_renamed + field_changed (3 distinct kinds)
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const cluster = within(screen.getByTestId(`auto-applied-group-${FIN_ID}`)).getByTestId(
    "auto-applied-kind-dots",
  );
  // role="img" gives the aria-hidden dot cluster a reliable AT-exposed text
  // alternative (aria-label on a role-less span is inconsistently announced)
  expect(cluster).toHaveAttribute("role", "img");
  // aria-label names each kind (data source = group.rows, not per-row pills)
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Renamed"));
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Added"));
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Field"));
  // one dot per distinct kind (3), no +N (≤4)
  expect(cluster.querySelectorAll("span[aria-hidden='true']").length).toBe(3);
  // header flex invariant: cluster is shrink-0, precedes the shrink-0 count badge
  expect(cluster.className).toContain("shrink-0");
  const count = screen.getByTestId(`auto-applied-count-${FIN_ID}`);
  expect(cluster.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("kind-dot cluster: destructive crew_removed renders and is ordered first (safety hint)", () => {
  render(
    <RecentAutoAppliedStrip
      data={groupData(["crew_added", "crew_removed"])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  const label = cluster.getAttribute("aria-label") ?? "";
  expect(label).toContain("Removed");
  expect(label).toContain("Added");
  // KIND_ORDER puts crew_removed before crew_added → "Removed" precedes "Added"
  expect(label.indexOf("Removed")).toBeLessThan(label.indexOf("Added"));
});

it("kind-dot cluster with an unknown kind → single fallback dot, label 'Change', raw enum absent", () => {
  render(<RecentAutoAppliedStrip data={groupData(["weird_new_kind"])} actions={noopActions()} />);
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  expect(cluster).toHaveAttribute("aria-label", expect.stringContaining("Change"));
  expect(cluster.textContent ?? "").not.toContain("weird_new_kind");
});

it("kind-dot cluster: >4 distinct kinds → 4 dots + a +N overflow marker", () => {
  // 5 known + 1 unknown = 6 distinct → 4 dots + "+2"
  render(
    <RecentAutoAppliedStrip
      data={groupData([
        "crew_removed",
        "crew_renamed",
        "crew_added",
        "field_changed",
        "crew_email_changed",
        "weird",
      ])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  // Count top-level markers by testid, not by `.rounded-full` — the destructive
  // crew_removed marker is a non-rounded minus-bar wrapper (KINDDOT-1), so a
  // shape filter would miscount. Marker identity is shape-independent.
  const markerEls = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markerEls.length).toBe(4);
  expect(cluster.textContent ?? "").toContain("+2");
});

it("kind-dot cluster: destructive crew_removed renders a minus-bar (non-color tell), not a disc", () => {
  render(
    <RecentAutoAppliedStrip
      data={groupData(["crew_removed", "crew_added"])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(2);
  // the removed marker is the minus-bar wrapper: NOT a rounded-full disc itself,
  // and it contains an h-0.5 w-2 rounded-full bar.
  const removedMarker = markers.find((m) => m.querySelector(".h-0\\.5.w-2"));
  expect(removedMarker).toBeTruthy();
  expect(removedMarker!.className).not.toContain("rounded-full");
  expect(removedMarker!.querySelector(".h-0\\.5.w-2.rounded-full")).toBeTruthy();
  // the non-removed (added) marker stays a filled size-2 rounded-full disc.
  const discs = markers.filter(
    (m) => m.className.includes("size-2") && m.className.includes("rounded-full"),
  );
  expect(discs.length).toBe(1);
});

it("kind-dot cluster: no crew_removed → all markers are filled discs, no minus-bar", () => {
  render(
    <RecentAutoAppliedStrip
      data={groupData(["crew_renamed", "crew_added"])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(2);
  expect(markers.every((m) => m.className.includes("rounded-full"))).toBe(true);
  expect(cluster.querySelector(".h-0\\.5.w-2")).toBeNull();
});

it("kind-dot cluster: destructive minus-bar stays visible with all 5 kinds (never in +N overflow)", () => {
  render(
    <RecentAutoAppliedStrip
      data={groupData([
        "crew_removed",
        "crew_renamed",
        "crew_added",
        "field_changed",
        "crew_email_changed",
      ])}
      actions={noopActions()}
    />,
  );
  const cluster = screen.getByTestId("auto-applied-kind-dots");
  // 5 known kinds → 4 shown markers + "+1"; crew_removed (KIND_ORDER[0]) is shown.
  const markers = [...cluster.querySelectorAll('[data-testid="auto-applied-kind-marker"]')];
  expect(markers.length).toBe(4);
  expect(markers.some((m) => m.querySelector(".h-0\\.5.w-2"))).toBe(true);
  expect(cluster.textContent ?? "").toContain("+1");
  expect(cluster.getAttribute("aria-label") ?? "").toContain("Removed");
});

it("kind-dot cluster: empty rows → renders nothing", () => {
  render(<RecentAutoAppliedStrip data={groupData([])} actions={noopActions()} />);
  expect(screen.queryByTestId("auto-applied-kind-dots")).toBeNull();
});

// ── REDESIGN-2: singleton group flatten (no card-in-card) ──────────────────
it("singleton group flattens the inner row card; multi-row keeps per-row cards", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  // RIA = one row (r4) → flattened (no border card chrome)
  expect(screen.getByTestId("auto-applied-row-r4").className).not.toContain("border");
  // FIN = three rows → each keeps its card border
  expect(screen.getByTestId("auto-applied-row-r1").className).toContain("border");
});

it("maps EVERY kind to its status-token pill (label + token classes, incl. removed/email/fallback)", () => {
  // Local fixture: one group, one row per kind (incl. crew_removed + an unknown
  // fallback kind) so no path can be broken/unmapped while tests pass.
  const P = "show-pills";
  const mk = (id: string, changeKind: string, diff: AutoAppliedRow["diff"]): AutoAppliedRow => ({
    id,
    changeKind,
    summary: `summary-${id}`,
    occurredAt: `2026-07-07T0${id.length}:00:00Z`,
    undoable: false,
    diff,
  });
  const data: Extract<RecentAutoApplied, { kind: "ok" }> = {
    kind: "ok",
    renderedCount: 6,
    overflowCount: 0,
    rosterShiftByShow: {},
    groups: [
      {
        showId: P,
        slug: "p",
        showName: "Pills",
        rows: [
          mk("p1", "crew_added", { kind: "single", caption: "Added", value: "A" }),
          mk("p2", "crew_renamed", { kind: "fromTo", from: "B", to: "C" }),
          mk("p3", "crew_removed", { kind: "single", caption: "Removed", value: "D" }),
          mk("p4", "field_changed", { kind: "none" }),
          mk("p5", "crew_email_changed", { kind: "none" }),
          mk("p6", "totally_unknown_kind", { kind: "none" }),
        ],
        acceptableIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
        undoableIds: [],
      },
    ],
  };
  render(<RecentAutoAppliedStrip data={data} actions={noopActions()} defaultExpanded />);
  // Target the PILL element specifically (a crew_added row also renders the
  // caption "Added" in its diff block, so getByText would be ambiguous).
  const pill = (rowId: string) =>
    within(screen.getByTestId(`auto-applied-row-${rowId}`)).getByTestId("auto-applied-kind-pill");
  // Label + colored token classes: text + /12 fill + /40 border ALL pinned.
  expect(pill("p1")).toHaveTextContent("Added");
  expect(pill("p1").className).toMatch(/text-status-positive-text/);
  expect(pill("p1").className).toMatch(/bg-status-positive\/12/);
  expect(pill("p1").className).toMatch(/border-status-positive\/40/);
  expect(pill("p2")).toHaveTextContent("Renamed");
  expect(pill("p2").className).toMatch(/text-status-review-text/);
  expect(pill("p2").className).toMatch(/bg-status-review\/12/);
  expect(pill("p2").className).toMatch(/border-status-review\/40/);
  expect(pill("p3")).toHaveTextContent("Removed");
  expect(pill("p3").className).toMatch(/text-status-warn-text/);
  expect(pill("p3").className).toMatch(/bg-status-warn\/12/);
  expect(pill("p3").className).toMatch(/border-status-warn\/40/);
  // Neutral kinds (field / email / unknown fallback): text + neutral bg + neutral border pinned.
  for (const [id, label] of [
    ["p4", "Field"],
    ["p5", "Email"],
    ["p6", "Change"],
  ] as const) {
    expect(pill(id)).toHaveTextContent(label);
    const cls = pill(id).className;
    expect(cls).toMatch(/text-status-idle-text/);
    expect(cls).toMatch(/bg-surface-sunken/);
    expect(cls).toMatch(/border-border/);
    expect(cls).not.toMatch(/bg-status-\w+\/12/); // never a colored fill on a neutral kind
  }
});

it("puts an Accept control on EVERY row and an Undo control ONLY on undoable rows", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);

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
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);

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
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);

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
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);

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
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);

  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));

  const cancelBtn = within(fin).getByTestId(`auto-applied-undo-all-cancel-${FIN_ID}`);
  await waitFor(() => expect(cancelBtn).toHaveFocus());
});

// ---- Destructive-confirm pass (spec 2026-07-16-destructive-confirm-pass R1/F2/F3) ----

function expectDestructiveRecipe(el: HTMLElement) {
  const tokens = el.className.split(/\s+/);
  for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
    expect(tokens).toContain(t);
  }
  for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
    expect(tokens).not.toContain(t);
  }
  expect(
    tokens
      .filter((t) => t.split(":").slice(0, -1).includes("hover"))
      .filter((t) => t.split(":").at(-1)!.startsWith("bg-")),
  ).toEqual([]);
}

/** Expand-agnostic helper: open the FinTech confirm and run the bulk undo to settle. */
async function openConfirmAndRunUndoAll() {
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  await act(async () => {
    fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  });
  await waitFor(() =>
    expect(within(fin).queryByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeNull(),
  );
}

it("undo-all confirm-go carries the destructive recipe; cancel stays neutral (FLOW4-5)", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  expectDestructiveRecipe(within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  const cancelTokens = within(fin)
    .getByTestId(`auto-applied-undo-all-cancel-${FIN_ID}`)
    .className.split(/\s+/);
  expect(cancelTokens).not.toContain("bg-warning-text");
  expect(cancelTokens).not.toContain("text-warning-bg");
});

it("partial bulk-undo failure renders the aggregate alert with counts from the mocked failures (FLOW4-4)", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  const alert = await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  expect(alert).toHaveAttribute("role", "alert");
  // Counts derive from the ARRANGED mocks: one {ok:false} + one {ok:true} over the
  // 2-id undoable group (r1, r2) — not from any hardcoded fixture length.
  expect(alert.textContent).toContain("Couldn't undo 1 of 2 changes.");
  expect(alert.textContent).toContain("The ones that failed stay in this list.");
});

it("a thrown undo action counts as a failed undo in the aggregate", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  const alert = await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  expect(alert.textContent).toContain("Couldn't undo 1 of 2 changes.");
});

it("zero failures → no alert", async () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  expect(screen.queryByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeNull();
});

it("all-success bulk undo announces completion via a persistent live region (DESTRUCT-3)", async () => {
  // The strip self-heals VISUALLY on revalidate (rows drop). SR parity comes from a
  // PERSISTENT sr-only role="status" whose TEXT SWAPS on completion — conditional
  // mounting drops the announcement (project a11y rule, mirrors StagedReviewCard).
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`)); // open confirm
  // The region is mounted and EMPTY before completion, so the later text change — not a
  // node insertion — is what a screen reader announces.
  const region = within(fin).getByTestId(`auto-applied-bulk-undo-status-${FIN_ID}`);
  expect(region).toHaveAttribute("role", "status");
  expect(region.textContent).toBe("");
  await act(async () => {
    fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  });
  await waitFor(() =>
    expect(within(fin).queryByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeNull(),
  );
  // SAME node, text swapped in — count derives from the group's 2-id set, not a literal.
  expect(region.textContent).toContain("Undid all 2 changes.");
  // The failure alert never renders on an all-success run.
  expect(screen.queryByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeNull();
});

it("the persistent status region stays empty on a partial failure (failure alert owns that branch)", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  // Region is present (persistent) but blank — no false "Undid all" on a partial failure.
  expect(screen.getByTestId(`auto-applied-bulk-undo-status-${FIN_ID}`).textContent).toBe("");
});

it("reopening the confirm blanks the success announcement (open-clears lifecycle)", async () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  const region = within(fin).getByTestId(`auto-applied-bulk-undo-status-${FIN_ID}`);
  expect(region.textContent).toContain("Undid all"); // populated after the run
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`)); // reopen
  expect(region.textContent).toBe(""); // open-clears blanks it — no stale re-announcement
});

it("reopening the confirm clears a visible alert (open-clears lifecycle)", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`)); // reopen
  expect(screen.queryByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeNull();
});

it("failure alert then a later all-success run: failure alert gone, sr-only success shown (completion writes {failed:0,total})", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  await openConfirmAndRunUndoAll(); // second run: reopen (clears) + all-success completion
  expect(screen.queryByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeNull();
  // DESTRUCT-3 (#422): the all-success second run writes the sentence into the
  // persistent sr-only status region (text present, not the always-mounted empty node)
  expect(screen.getByTestId(`auto-applied-bulk-undo-status-${FIN_ID}`)).toHaveTextContent(
    "Undid all 2 changes",
  );
});

// ── Transition-audit: compound collapse-while-confirm-open ─────────────────
it("collapsing a group while its confirm panel is open keeps the confirm mounted (inert), state persists", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  // open the Undo-all confirm
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  expect(within(fin).getByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeInTheDocument();
  // collapse the group (toggle) while the confirm is open
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`));
  // confirm markup persists (always-mounted morph, state preserved) but the
  // region is inert — no second animation fires on the confirm sub-panel
  expect(within(fin).getByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-panel-${FIN_ID}`)).toHaveAttribute("inert");
  // re-expand: confirm still open (state persisted)
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`));
  expect(screen.getByTestId(`auto-applied-panel-${FIN_ID}`)).not.toHaveAttribute("inert");
  expect(within(fin).getByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeInTheDocument();
});

// DESTRUCT-3 singular-copy coverage (complements #422's persistent-region tests,
// which only exercise the plural 2-change case).
it("all-success bulk undo with a single undoable row → singular 'change' copy", async () => {
  const SID = "solo";
  const data: RecentAutoApplied = {
    kind: "ok",
    renderedCount: 1,
    overflowCount: 0,
    rosterShiftByShow: {},
    groups: [
      {
        showId: SID,
        slug: "solo",
        showName: "Solo",
        acceptableIds: ["u1"],
        undoableIds: ["u1"],
        rows: [
          {
            id: "u1",
            changeKind: "crew_added",
            summary: "added",
            occurredAt: "2026-07-07T00:00:00Z",
            undoable: true,
            diff: { kind: "single", caption: "Added", value: "X" },
          },
        ],
      },
    ],
  };
  render(
    <RecentAutoAppliedStrip
      data={data}
      actions={{
        ...noopActions(),
        undoFromDashboardAction: vi.fn().mockResolvedValue({ ok: true }),
      }}
      defaultExpanded
    />,
  );
  fireEvent.click(screen.getByTestId(`auto-applied-undo-all-${SID}`));
  await act(async () => {
    fireEvent.click(screen.getByTestId(`auto-applied-undo-all-confirm-go-${SID}`));
  });
  const status = await screen.findByTestId(`auto-applied-bulk-undo-status-${SID}`);
  expect(status.textContent).toContain("Undid all 1 change");
  expect(status.textContent).not.toContain("1 changes"); // singular, not plural
});

it("alert persists across collapse → re-expand", async () => {
  const actions = noopActions();
  actions.undoFromDashboardAction = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  await openConfirmAndRunUndoAll();
  await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`);
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)); // collapse
  // alert node persists (always-mounted height-morph) but its region is inert while collapsed
  expect(screen.getByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeInTheDocument();
  expect(screen.getByTestId(`auto-applied-panel-${FIN_ID}`)).toHaveAttribute("inert");
  fireEvent.click(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)); // re-expand
  // "1 of" = the single {ok:false} arranged above; derived from the mock arrangement.
  expect(screen.getByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`).textContent).toContain(
    "Couldn't undo 1 of",
  );
});

it("bulk undo completion moves focus to the group toggle when focus was inside the panel (FLOW4-6)", async () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  await openConfirmAndRunUndoAll(); // confirm-go click leaves focus inside the panel
  await waitFor(() => expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveFocus());
});

it("keep-changes cancel moves focus to the group toggle", async () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-cancel-${FIN_ID}`));
  await waitFor(() => expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveFocus());
});

it("completion restores focus to the toggle after disabled-focus ejection to body (WCAG 2.4.3)", async () => {
  // Real-browser behavior: clicking confirm-go sets pending → disabled={pending}
  // → Chrome/Firefox eject focus to <body>. The ejected-to-body state must still
  // count as "focus was ours" so completion restores the toggle.
  const actions = noopActions();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  actions.undoFromDashboardAction = vi.fn().mockImplementation(async () => {
    await gate;
    return { ok: true };
  });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  const confirmGo = within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`);
  confirmGo.focus();
  fireEvent.click(confirmGo);
  // Simulate the browser's disabled-focus ejection: focus falls to <body>.
  // jsdom's blur() is a no-op on a disabled element (real browsers eject
  // automatically on disable), so lift the attribute for the manual ejection.
  (document.activeElement as HTMLElement).removeAttribute("disabled");
  (document.activeElement as HTMLElement).blur();
  expect(document.activeElement).toBe(document.body);
  await act(async () => {
    release();
  });
  await waitFor(() =>
    expect(within(fin).queryByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeNull(),
  );
  expect(screen.getByTestId(`auto-applied-toggle-${FIN_ID}`)).toHaveFocus();
});

it("completion with focus planted outside the group does NOT move focus", async () => {
  const actions = noopActions();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  actions.undoFromDashboardAction = vi.fn().mockImplementation(async () => {
    await gate;
    return { ok: true };
  });
  render(
    <>
      <button data-testid="external-focus-target">outside</button>
      <RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />
    </>,
  );
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  const external = screen.getByTestId("external-focus-target");
  external.focus();
  await act(async () => {
    release();
  });
  await waitFor(() =>
    expect(within(fin).queryByTestId(`auto-applied-undo-all-confirm-${FIN_ID}`)).toBeNull(),
  );
  expect(external).toHaveFocus();
});

it("collapse during pending: completes without throwing, no focus steal, alert on re-expand", async () => {
  const actions = noopActions();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  actions.undoFromDashboardAction = vi
    .fn()
    .mockImplementationOnce(async () => {
      await gate;
      return { ok: false, code: "UNDO_SUPERSEDED" };
    })
    .mockResolvedValue({ ok: true });
  render(<RecentAutoAppliedStrip data={okData()} actions={actions} defaultExpanded />);
  const fin = screen.getByTestId(`auto-applied-group-${FIN_ID}`);
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-${FIN_ID}`));
  fireEvent.click(within(fin).getByTestId(`auto-applied-undo-all-confirm-go-${FIN_ID}`));
  const toggle = screen.getByTestId(`auto-applied-toggle-${FIN_ID}`);
  fireEvent.click(toggle); // collapse mid-loop; focus follows the click onto the toggle
  toggle.focus();
  await act(async () => {
    release();
  });
  expect(toggle).toHaveFocus(); // no steal (already there; nothing yanked elsewhere)
  fireEvent.click(toggle); // re-expand
  expect(await screen.findByTestId(`auto-applied-bulk-undo-alert-${FIN_ID}`)).toBeInTheDocument();
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

// ── Mobile auto-applied parity (Task 1): headingLevel prop + FLOW4-7 ──────────

it("default: section heading is h4, group headings are h5 (dashboard regression pin)", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  expect(
    screen.getByRole("heading", { level: 4, name: "Recently auto-applied" }),
  ).toBeInTheDocument();
  // okData() has two groups → two group headings, all at level 5.
  const groupHeadings = screen.getAllByRole("heading", { level: 5 });
  expect(groupHeadings.length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
});

it("headingLevel=2: section heading is h2, group headings are h3 (no h1->h4 skip on the page)", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} headingLevel={2} />);
  expect(
    screen.getByRole("heading", { level: 2, name: "Recently auto-applied" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThanOrEqual(2);
  expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  expect(screen.queryByRole("heading", { level: 5 })).toBeNull();
});

it("headingLevel=2 infra_error branch renders an h2 (not a hardcoded h4)", () => {
  render(
    <RecentAutoAppliedStrip
      data={{ kind: "infra_error", message: "x" }}
      actions={noopActions()}
      headingLevel={2}
    />,
  );
  expect(
    screen.getByRole("heading", { level: 2, name: "Recently auto-applied" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
});

// ── MOBILEPARITY-1: strip heading reads as a section head ─────────────────────
// The heading sized text-sm (14px) matched the group-card show-names beneath it,
// so it didn't read as a section head. Bump to text-base (16px) — identical class
// at BOTH mount levels (spec §D3: same visual classes across dashboard h4 + page
// h2). 16px stays below both parents (page h1 24px, dashboard section h3 18px), so
// no hierarchy inversion. Weight stays font-semibold (app heading-weight convention).
it("MOBILEPARITY-1: strip heading is text-base (not text-sm), identical class at both mounts (§D3)", () => {
  const { unmount } = render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const h4 = screen.getByRole("heading", { level: 4, name: "Recently auto-applied" });
  expect(h4).toHaveClass("text-base");
  expect(h4).not.toHaveClass("text-sm");
  const h4Class = h4.className;
  unmount();

  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} headingLevel={2} />);
  const h2 = screen.getByRole("heading", { level: 2, name: "Recently auto-applied" });
  expect(h2).toHaveClass("text-base");
  expect(h2).not.toHaveClass("text-sm");
  // §D3: identical visual classes across the two mount contexts.
  expect(h2.className).toBe(h4Class);
});

it("MOBILEPARITY-1: infra_error heading is also text-base (both branches consistent, §D3)", () => {
  render(
    <RecentAutoAppliedStrip data={{ kind: "infra_error", message: "x" }} actions={noopActions()} />,
  );
  const h4 = screen.getByRole("heading", { level: 4, name: "Recently auto-applied" });
  expect(h4).toHaveClass("text-base");
  expect(h4).not.toHaveClass("text-sm");
});

it("FLOW4-7: populated section is a named region via aria-labelledby, with NO aria-label", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const region = screen.getByRole("region", { name: "Recently auto-applied" });
  expect(region).not.toHaveAttribute("aria-label");
  expect(region).toHaveAttribute("aria-labelledby");
});

it("FLOW4-7: infra_error section is also a named region via aria-labelledby, no aria-label", () => {
  render(
    <RecentAutoAppliedStrip data={{ kind: "infra_error", message: "x" }} actions={noopActions()} />,
  );
  const region = screen.getByRole("region", { name: "Recently auto-applied" });
  expect(region).not.toHaveAttribute("aria-label");
  expect(region).toHaveAttribute("aria-labelledby");
});

// ── Header parity: count chip + ? help (dashboard-only) ───────────────────────
// The dashboard strip header gains a section count chip + a HoverHelp "?" icon,
// mirroring the "Needs attention" header. Both are gated on headingLevel===4 so
// the shared /admin/needs-attention page (headingLevel 2) keeps its bare heading.

it("HEADERPARITY: dashboard header shows a count chip = renderedCount + overflowCount", () => {
  const data = okData();
  render(<RecentAutoAppliedStrip data={data} actions={noopActions()} />);
  const chip = screen.getByTestId("recent-auto-applied-count-chip");
  // Derived from the fixture, not a bare literal: 4 + 3 = 7.
  expect(chip).toHaveTextContent(String(data.renderedCount + data.overflowCount));
});

it("HEADERPARITY: dashboard header renders the ? help affordance linking review-queues#re-stage", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  const root = screen.getByTestId("help-affordance--dashboard-recently-auto-applied--tooltip");
  // Portaled + jsdom-hidden (zero rects -> anchor-gone): computed accname is
  // empty, so match by role within the owned body and assert the label attr.
  const learnMore = within(ownedBody(root)).getByRole("link", { hidden: true });
  expect(learnMore.getAttribute("aria-label") ?? "").toMatch(/learn more/i);
  expect(learnMore).toHaveAttribute("href", "/help/admin/review-queues#re-stage");
});

it("HEADERPARITY: dashboard infra_error branch keeps the help but shows NO count chip", () => {
  render(
    <RecentAutoAppliedStrip data={{ kind: "infra_error", message: "x" }} actions={noopActions()} />,
  );
  expect(
    screen.getByTestId("help-affordance--dashboard-recently-auto-applied--tooltip"),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("recent-auto-applied-count-chip")).toBeNull();
});

it("HEADERPARITY: needs-attention page (headingLevel 2) renders neither chip nor help, bare heading DOM", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} headingLevel={2} />);
  expect(screen.queryByTestId("recent-auto-applied-count-chip")).toBeNull();
  expect(
    screen.queryByTestId("help-affordance--dashboard-recently-auto-applied--tooltip"),
  ).toBeNull();
  // Bare-DOM contract: the heading is a direct child of the strip <section>, NOT
  // wrapped in a flex chrome div (Codex R4 finding 2).
  const heading = screen.getByRole("heading", { level: 2, name: "Recently auto-applied" });
  expect(heading.parentElement).toHaveAttribute("data-testid", "recent-auto-applied-strip");
});

// ── REDESIGN-3: structured field_changed diff (kind:"fields") ────────────────
import type { FieldChangeEntry } from "@/lib/sync/changeLog/fieldChanges";

/** Portaled popover body (hoverhelp-smart-position §4.1): resolve via the
 * root wrapper's aria-owns — the body is no longer a wrapper descendant. */
function ownedBody(root: HTMLElement): HTMLElement {
  const id = root.getAttribute("aria-owns");
  if (!id) throw new Error("affordance root missing aria-owns");
  const body = document.getElementById(id);
  if (!body) throw new Error("aria-owns target not in document");
  return body;
}


// admin-show-modal Task 11: ShowsTable/StagedReviewCard are client islands that
// read the current search params (param-preserving modal hrefs) — stub the
// app-router hooks jsdom has no router for.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

function fieldsData(
  entries: FieldChangeEntry[],
  summary = "COI status changed on this sync",
): Extract<RecentAutoApplied, { kind: "ok" }> {
  return {
    kind: "ok",
    renderedCount: 1,
    overflowCount: 0,
    rosterShiftByShow: {},
    groups: [
      {
        showId: "show-x",
        slug: "x",
        showName: "Test Show",
        rows: [
          {
            id: "f1",
            changeKind: "field_changed",
            summary,
            occurredAt: "2026-07-07T08:00:00Z",
            undoable: false,
            diff: { kind: "fields", entries },
          },
        ],
        acceptableIds: ["f1"],
        undoableIds: [],
      },
    ],
  };
}

it("REDESIGN-3: renders a fields diff with the field name as the heading", () => {
  render(
    <RecentAutoAppliedStrip
      data={fieldsData([
        { label: "COI status", from: "(none)", to: "received", note: null },
        { label: "Role — Jordan A. Lee", from: "A1, LEAD", to: "A1", note: null },
        { label: "PO number", from: null, to: null, note: "cleared on this sync" },
      ])}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  expect(screen.getByText("COI status")).toBeInTheDocument();
  expect(screen.getByText("Role — Jordan A. Lee")).toBeInTheDocument();
  expect(screen.getByText("cleared on this sync")).toBeInTheDocument();
  // field label is the heading — carries semibold weight (over the diff values).
  expect(screen.getByText("COI status")).toHaveClass("font-semibold");
});

it("REDESIGN-3: the fields branch adds no transition wrapper (empty inventory)", () => {
  const { container } = render(
    <RecentAutoAppliedStrip
      data={fieldsData([{ label: "COI status", from: "(none)", to: "received", note: null }])}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  expect(container.querySelector("[data-framer-appear-id]")).toBeNull();
});

it("REDESIGN-3: a field_changed (fields) row renders NO 'Crew member' label", () => {
  render(
    <RecentAutoAppliedStrip
      data={fieldsData([{ label: "COI status", from: "(none)", to: "received", note: null }])}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  expect(screen.queryByText("Crew member")).toBeNull();
});

it("REDESIGN-3: crew rows STILL render the 'Crew member' label", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} defaultExpanded />);
  expect(screen.getAllByText("Crew member").length).toBeGreaterThan(0);
});

it("REDESIGN-3: long values wrap on label/from/to/note (no overflow)", () => {
  const lname = "Role — " + "N".repeat(110);
  const lfrom = "F".repeat(120);
  const lto = "T".repeat(120);
  const lnote = "P".repeat(120);
  render(
    <RecentAutoAppliedStrip
      data={fieldsData([
        { label: lname, from: lfrom, to: lto, note: null },
        { label: "Pull sheet", from: null, to: null, note: lnote },
      ])}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  for (const s of [lname, lfrom, lto, lnote]) {
    expect(screen.getByText(s)).toHaveClass("wrap-break-word");
  }
});

it("REDESIGN-3: renders ALL entries — no +N more collapse", () => {
  const entries: FieldChangeEntry[] = Array.from({ length: 14 }, (_, i) => ({
    label: `Role — Person ${i}`,
    from: "A1",
    to: "A1, LEAD",
    note: null,
  }));
  render(
    <RecentAutoAppliedStrip
      data={fieldsData(entries, "Role changed on this sync")}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  for (let i = 0; i < 14; i++) {
    expect(screen.getByText(`Role — Person ${i}`)).toBeInTheDocument();
  }
  expect(screen.queryByText(/\+\d+ more|show more/i)).toBeNull();
});

it("REDESIGN-3: the Unavailable marker renders as a distinct warning row", () => {
  render(
    <RecentAutoAppliedStrip
      data={fieldsData([
        {
          label: "Unavailable",
          from: null,
          to: null,
          note: "1 field change on this sync — details unavailable",
        },
      ])}
      actions={noopActions()}
      defaultExpanded
    />,
  );
  const marker = screen.getByText(/details unavailable/);
  expect(marker).toBeInTheDocument();
  expect(marker.closest("li")).toHaveClass("bg-warning-bg");
});
