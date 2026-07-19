// @vitest-environment jsdom
// M12.2 Phase A Task 5 — ShowsTable (spec §5.2). Dense table: Show / Dates /
// Crew / Sync + chevron; whole row links to /admin/show/{slug}. Title-area
// Live pill (row.isLive, precomputed — never recomputed) + Publishing badge
// (!published), mutually exclusive. Sync column = HEALTH only via
// syncStatusBucket (decoupled from live/publishing). Overflow notice when
// overflowCount>0. Preserves ActiveShowsPanel empty-state + null-title (V3).
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

// admin-show-modal Task 11 (spec §3.1 / D9): ShowsTable is a client island and
// builds param-preserving modal hrefs from the CURRENT search params — the mock
// is mutable so tests can vary the ambient params per case.
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => mockSearchParams,
}));
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { formatDataGapBreakdown, type DataGapsSummary } from "@/lib/parser/dataGaps";
import { mkDataGaps } from "../../helpers/dataGapsFixture";

afterEach(cleanup);

const now = new Date("2026-06-03T12:00:00.000Z");

// Derive the expected badge accessible name from the SINGLE SOURCE OF TRUTH
// (dataGapClassDetails) — never hardcode the plural/total strings (anti-tautology).
function expectedBadgeName(s: DataGapsSummary): string {
  // Derived from the single-source cap helper (the data source), NOT the rendered
  // container — so the assertion tracks the real bounded string (anti-tautology).
  return `${s.total} data ${s.total === 1 ? "gap" : "gaps"}: ${formatDataGapBreakdown(s)}`;
}

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 4,
    lastSyncedAt: "2026-06-03T10:00:00.000Z",
    lastSyncStatus: "ok",
    lastCheckedAt: "2026-06-03T10:05:00.000Z",
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

// ── Optimistic open skeleton (perceived-latency tier 2) ──────────────────────
// Opening a row is a full RSC navigation; until the server's first streamed
// chunk lands there is ZERO on-screen feedback (the Suspense skeleton is
// server-rendered, so it too waits on the round-trip). The row click must
// mount the ShowReviewModalSkeleton client-side immediately. Failure mode
// caught: click produces no pending UI and the screen sits inert for the
// whole server round-trip.

describe("ShowsTable optimistic open skeleton", () => {
  // jsdom implements no navigation: kill the anchor default so clicking the
  // row exercises ONLY the React onClick (no "not implemented" stderr noise).
  function clickRow(link: HTMLElement, init?: MouseEventInit) {
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link, init);
  }

  it("primary unmodified row click mounts the review-modal skeleton immediately", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    // Client-side, synchronously — no navigation has committed.
    expect(screen.getByTestId("published-show-review-modal")).toBeInTheDocument();
  });

  it("modified / non-primary clicks (new-tab intents) never mount the skeleton", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const link = screen.getByTestId("shows-table-row-rpas");
    for (const init of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ] satisfies MouseEventInit[]) {
      clickRow(link, init);
      expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
    }
  });

  it("REGRESSION (critique P0): skeleton must NOT reappear after the modal later closes", () => {
    // open commit (?show=rpas) then close commit (params back to empty). A
    // never-reset pendingSlug makes `committedShow !== pendingSlug` true again
    // on close — the loading skeleton would permanently cover the dashboard.
    mockSearchParams = new URLSearchParams();
    const rows = [row({ slug: "rpas" })];
    const view = render(<ShowsTable rows={rows} now={now} activeCount={1} overflowCount={0} />);
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    mockSearchParams = new URLSearchParams("show=rpas");
    view.rerender(<ShowsTable rows={rows} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
    // Close commits: show param stripped.
    mockSearchParams = new URLSearchParams();
    view.rerender(<ShowsTable rows={rows} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
  });

  it("REGRESSION (critique P1): failed open (redirect strips ?show) clears the overlay on that commit", () => {
    // Unknown/blocked slug: the loader redirects to bare /admin — the ?show
    // value never commits, but the redirect commit still changes the params
    // object. The overlay must clear instead of stranding a fake "loading".
    mockSearchParams = new URLSearchParams();
    const rows = [row({ slug: "rpas" })];
    const view = render(<ShowsTable rows={rows} now={now} activeCount={1} overflowCount={0} />);
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    expect(screen.getByTestId("published-show-review-modal")).toBeInTheDocument();
    // Redirect commit: params identity changes, show still absent.
    mockSearchParams = new URLSearchParams();
    view.rerender(<ShowsTable rows={rows} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
  });

  it("critique P1: the optimistic skeleton is cancelable — scrim tap dismisses it", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    expect(screen.getByTestId("published-show-review-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("published-show-review-backdrop"));
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
  });

  it("popstate (browser Back cancels the in-flight open) clears the skeleton — no stuck overlay", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    expect(screen.getByTestId("published-show-review-modal")).toBeInTheDocument();
    fireEvent.popState(window);
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
  });

  it("skeleton unmounts once the ?show param commits (server fallback takes over)", () => {
    mockSearchParams = new URLSearchParams();
    const view = render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    clickRow(screen.getByTestId("shows-table-row-rpas"));
    expect(screen.getByTestId("published-show-review-modal")).toBeInTheDocument();
    // Navigation commits: the URL now carries ?show=rpas and the server's own
    // Suspense fallback owns the frame — the client copy must be gone in the
    // SAME render pass (render-time derivation, no one-frame double overlay).
    mockSearchParams = new URLSearchParams("show=rpas");
    view.rerender(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    expect(screen.queryByTestId("published-show-review-modal")).toBeNull();
  });
});

describe("ShowsTable", () => {
  it("row links to the /admin?show= modal URL; renders Show/Dates/Crew/Sync + chevron", () => {
    mockSearchParams = new URLSearchParams();
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const link = screen.getByTestId("shows-table-row-rpas");
    expect(link.getAttribute("href")).toBe("/admin?show=rpas");
    expect(screen.getByTestId("shows-sync-rpas")).toBeInTheDocument();
    expect(screen.getByTestId("shows-chevron-rpas")).toBeInTheDocument();
    expect(link.textContent).toContain("4 crew");
  });

  it("row href preserves current params (bucket=archived survives opening a show — D9)", () => {
    // Failure mode caught: a fixed `/admin?show=` literal (or the old
    // /admin/show/<slug> path) would drop the archived-bucket context, so
    // closing the modal would dump the admin back on the active bucket.
    mockSearchParams = new URLSearchParams("bucket=archived");
    try {
      render(
        <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
      );
      const link = screen.getByTestId("shows-table-row-rpas");
      expect(link.getAttribute("href")).toBe("/admin?bucket=archived&show=rpas");
    } finally {
      mockSearchParams = new URLSearchParams();
    }
  });

  it("sync column uses syncStatusBucket ordered priority (drive_error -> warn 'Couldn't reach Drive', not synced)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "x", lastSyncStatus: "drive_error" })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const sync = screen.getByTestId("shows-sync-x");
    expect(sync.textContent).toContain("Couldn't reach Drive");
    expect(sync.textContent).not.toMatch(/Synced|Live/);
    expect(within(sync).getByTestId("status-dot-warn")).toBeInTheDocument();
  });

  // ── Bucket-aware Sync cell (spec 2026-07-17-sync-cell-edited-checked; revision) ──
  // Line 1 = health (dot + bare label). "Checked {rel}" is now a NATIVE hover tooltip
  // (`title`) on the desktop cell — no in-row element (zero layout shift), and mobile
  // omits it. "Edited" moved to the show-page header.
  const NOW_10 = new Date("2026-06-03T10:00:00.000Z");

  it("ok: renders bare 'Synced' inline; Checked is a hover title with no in-row element (no layout shift)", () => {
    render(
      <ShowsTable
        rows={[
          row({
            slug: "ok1",
            lastSyncStatus: "ok",
            lastSyncedAt: "2026-06-03T08:00:00.000Z", // Edited: 2h ago — now in the header only
            lastCheckedAt: "2026-06-03T09:58:00.000Z", // Checked: 2 min ago
          }),
        ]}
        now={NOW_10}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const cell = screen.getByTestId("shows-sync-ok1");
    // Inline text is the health label only — no Checked/Edited text renders in the row,
    // so hovering across rows never changes row height.
    expect(cell.textContent).toContain("Synced");
    expect(cell.textContent).not.toMatch(/ago|Edited|Checked/);
    // Checked time lives on the native tooltip (title) of the desktop cell.
    expect(within(cell).getByTitle("Checked 2 min ago")).toBeInTheDocument();
    // No hover-reveal element remains, and the row Link no longer carries the
    // layout-shifting `group` marker.
    expect(within(cell).queryByTestId("shows-sync-times-ok1")).toBeNull();
    expect(screen.getByTestId("shows-table-row-ok1").className).not.toContain("group");
  });

  it.each(["drive_error", "sheet_unavailable", "parse_error"])(
    "%s: Checked title present, no inline Checked/Edited text",
    (status) => {
      render(
        <ShowsTable
          rows={[
            row({
              slug: "e",
              lastSyncStatus: status,
              lastSyncedAt: "2026-06-03T08:00:00.000Z",
              lastCheckedAt: "2026-06-03T09:58:00.000Z",
            }),
          ]}
          now={NOW_10}
          activeCount={1}
          overflowCount={0}
        />,
      );
      const cell = screen.getByTestId("shows-sync-e");
      expect(within(cell).getByTitle("Checked 2 min ago")).toBeInTheDocument();
      expect(cell.textContent).not.toMatch(/Checked|Edited/);
    },
  );

  it.each([null, undefined, ""])("no Checked title when lastCheckedAt is %p", (v) => {
    render(
      <ShowsTable
        rows={[row({ slug: "s", lastSyncStatus: null, lastCheckedAt: v as string | null })]}
        now={NOW_10}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const cell = screen.getByTestId("shows-sync-s");
    expect(within(cell).queryByTitle(/Checked/)).toBeNull();
    expect(cell.textContent).toContain("Not synced yet");
  });

  it("Checked title uses lastCheckedAt independent of lastSyncedAt (null synced still gets a title)", () => {
    render(
      <ShowsTable
        rows={[
          row({
            slug: "n",
            lastSyncStatus: "pending",
            lastSyncedAt: null,
            lastCheckedAt: "2026-06-03T09:58:00.000Z",
          }),
        ]}
        now={NOW_10}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const cell = screen.getByTestId("shows-sync-n");
    expect(within(cell).getByTitle("Checked 2 min ago")).toBeInTheDocument();
    expect(cell.textContent).not.toMatch(/Edited/);
  });

  it("mobile stacked cell exposes no Checked title (no hover surface on touch)", () => {
    render(
      <ShowsTable
        rows={[
          row({
            slug: "mb",
            lastSyncStatus: "ok",
            lastSyncedAt: "2026-06-03T08:00:00.000Z",
            lastCheckedAt: "2026-06-03T09:58:00.000Z",
          }),
        ]}
        now={NOW_10}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const mobile = screen.getByTestId("shows-meta-mobile-mb");
    expect(within(mobile).queryByTitle(/Checked/)).toBeNull();
    expect(mobile.textContent).toMatch(/Synced/);
    expect(mobile.textContent).not.toMatch(/Checked|Edited/);
  });

  it.each([
    ["t_two", "ok", "2026-06-03T09:58:00.000Z"],
    ["t_chk", "drive_error", "2026-06-03T09:58:00.000Z"],
    ["t_abs", "ok", null],
  ])("SyncCell renders %s with no animation markup", (slug, status, checked) => {
    render(
      <ShowsTable
        rows={[row({ slug, lastSyncStatus: status, lastCheckedAt: checked as string | null })]}
        now={NOW_10}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const cell = screen.getByTestId(`shows-sync-${slug}`);
    const cellRoot = cell.firstElementChild as HTMLElement; // SyncCell <span> root
    expect(cellRoot.className).not.toMatch(/transition|animate-/);
    expect(cellRoot.getAttribute("data-motion")).toBeNull();
  });

  it("SyncCell source declares no framer-motion / exit / initial / animate", () => {
    const src = readFileSync("components/admin/ShowsTable.tsx", "utf8");
    const start = src.indexOf("function SyncCell");
    const body = src.slice(start, src.indexOf("\nfunction ", start + 1));
    expect(body).not.toMatch(
      /AnimatePresence|framer-motion|motion\.|\bexit=|\binitial=|\banimate=/,
    );
  });

  it("Live pill renders by title iff row.isLive (never in sync column)", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "live", isLive: true, lastSyncStatus: "drive_error" }),
          row({ slug: "dead", isLive: false }),
        ]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-live-pill-live")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-live-pill-dead")).toBeNull();
    // live+failing show: sync column still shows the failure, Live is separate
    expect(screen.getByTestId("shows-sync-live").textContent).not.toMatch(/Live/);
  });

  it("Publishing badge renders for a finalize-owned !published row; mutually exclusive with Live (§3.2)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "pub", published: false, isLive: false, finalizeOwned: true })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-publishing-pub")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-held-pill-pub")).toBeNull();
    expect(screen.queryByTestId("shows-live-pill-pub")).toBeNull();
  });

  it("Held pill renders for a !published, !finalizeOwned row — distinct from Publishing… (§3.2)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "held", published: false, isLive: false, finalizeOwned: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const held = screen.getByTestId("shows-held-pill-held");
    expect(held.textContent).toMatch(/Held — not published/);
    expect(screen.queryByTestId("shows-publishing-held")).toBeNull();
    expect(screen.queryByTestId("shows-live-pill-held")).toBeNull();
  });

  it("liveCount parity: number of Live pills === rows.filter(isLive).length (anti-tautology, asserted vs data)", () => {
    const rows = [
      row({ slug: "a", isLive: true }),
      row({ slug: "b", isLive: false }),
      row({ slug: "c", isLive: true }),
    ];
    const { container } = render(
      <ShowsTable rows={rows} now={now} activeCount={3} overflowCount={0} />,
    );
    const pills = container.querySelectorAll("[data-testid^='shows-live-pill-']");
    expect(pills.length).toBe(rows.filter((r) => r.isLive).length);
  });

  // ── Status column (published/unpublished) — spec 2026-06-30-admin-shows-status-column ──
  it("Published pill renders inline for a published, non-live row (status-positive) — §3", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "pubd", published: true, isLive: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const pill = screen.getByTestId("shows-published-pill-pubd");
    expect(pill.textContent).toMatch(/Published/);
    // right VISUAL token, not just the right text (status-positive/teal) — §3
    expect(pill.className).toContain("border-status-positive");
    expect(pill.className).toContain("text-status-positive-text");
    expect(pill.querySelector(".bg-status-positive")).not.toBeNull();
    // mutually exclusive: no other inline state pill for this row
    expect(screen.queryByTestId("shows-live-pill-pubd")).toBeNull();
    expect(screen.queryByTestId("shows-held-pill-pubd")).toBeNull();
  });

  it("inline Held pill keeps the verbose 'Held — not published' copy (place=inline) — §3.1", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "h", published: false, isLive: false, finalizeOwned: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-held-pill-h").textContent).toMatch(/Held — not published/);
  });

  it("renders a Status COLUMN pill (place=column) with the compact 'Held' label — §4.1", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "h2", published: false, isLive: false, finalizeOwned: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const colPill = screen.getByTestId("shows-statuscol-held-h2");
    expect(colPill.textContent).toBe("Held"); // compact, no "— not published"
    // the inline pill still exists in the DOM (CSS-toggled), with the verbose copy
    expect(screen.getByTestId("shows-held-pill-h2").textContent).toMatch(/Held — not published/);
  });

  it("inline pill wraps to hide ≥960px and the Status cell hides <960px — §4.1", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "p3", published: true, isLive: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    // inline wrapper carries the hide-at-960 class (check the parent's className string
    // directly — a bracket-heavy attribute selector is fragile in jsdom's selector engine)
    const inline = screen.getByTestId("shows-published-pill-p3");
    expect(inline.parentElement?.className ?? "").toContain("min-[960px]:hidden");
    // column cell carries hidden + show-at-960
    const cell = screen.getByTestId("shows-status-p3");
    expect(cell.className).toContain("hidden");
    expect(cell.className).toContain("min-[960px]:block");
  });

  it("ROW_GRID defines a 7-track template at min-[960px] (Status before chevron; Dates split into Start+End)", () => {
    render(<ShowsTable rows={[row({ slug: "g" })]} now={now} activeCount={1} overflowCount={0} />);
    const header = screen.getByTestId("shows-table-header");
    expect(header.className).toContain(
      "min-[960px]:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5rem_12rem_6rem_1.25rem]",
    );
  });

  it("6-col grid + cells + mobile sub-line gate at min-[768px] (not 720); Status stays min-[960px] — 720→768 fix", () => {
    const { container } = render(
      <ShowsTable rows={[row({ slug: "bp" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const header = screen.getByTestId("shows-table-header");
    // 6-col grid now activates at 768 (Show/Start/End/Crew/Sync/chevron); the
    // 7-col Status grid still at 960.
    expect(header.className).toContain("min-[768px]:grid");
    expect(header.className).toContain(
      "min-[768px]:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5rem_12rem_1.25rem]",
    );
    expect(header.className).toContain(
      "min-[960px]:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_5rem_12rem_6rem_1.25rem]",
    );
    // the mobile sub-line hides at 768; a desktop cell shows at 768
    expect(screen.getByTestId("shows-meta-mobile-bp").className).toContain("min-[768px]:hidden");
    expect(screen.getByTestId("shows-sync-bp").className).toContain("min-[768px]:block");
    // COMPREHENSIVE partial-miss guard: NO min-[720px] survives anywhere in the rendered table
    expect(container.innerHTML).not.toContain("min-[720px]");
  });

  it("clicking the Status header sorts by state severity (asc: publishing < held < live < published) — §5", () => {
    const order = () =>
      screen
        .getAllByTestId(/^shows-table-row-/)
        .map((el) => (el.getAttribute("data-testid") ?? "").replace("shows-table-row-", ""));
    render(
      <ShowsTable
        rows={[
          row({ slug: "pubd", published: true, isLive: false }), // published → rank 3
          row({ slug: "pubg", published: false, isLive: false, finalizeOwned: true }), // publishing → 0
          row({ slug: "held", published: false, isLive: false, finalizeOwned: false }), // held → 1
          row({ slug: "live", published: true, isLive: true }), // live → 2
        ]}
        now={now}
        activeCount={4}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-status")); // asc
    expect(order()).toEqual(["pubg", "held", "live", "pubd"]);
    fireEvent.click(screen.getByTestId("shows-sort-status")); // desc reverses
    expect(order()).toEqual(["pubd", "live", "held", "pubg"]);
  });

  it("overflowCount>0 -> 'showing first N of M' overflow notice renders", () => {
    render(
      <ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={600} overflowCount={599} />,
    );
    const notice = screen.getByTestId("shows-table-overflow");
    expect(notice.textContent).toMatch(/1/);
    expect(notice.textContent).toMatch(/600/);
    expect(notice.textContent).toMatch(/developer/i);
    // M12.10: when capped, the notice DISCLOSES that sort/Find scope to the shown
    // rows (the headers sort only the loaded slice, not the full set).
    expect(notice.textContent).toMatch(/sorting and Find apply to just these/i);
  });

  it("capped: the scope notice renders ABOVE the table header (seen before sorting/Find) — R4 placement", () => {
    // Negative-regression: this FAILS on the prior R3 placement (notice rendered
    // AFTER the list, below the sort headers). Order must be controls → notice →
    // table header so the limitation is visible before the first sort/search.
    render(
      <ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={600} overflowCount={599} />,
    );
    const notice = screen.getByTestId("shows-table-overflow");
    const header = screen.getByTestId("shows-table-header");
    const chip = screen.getByTestId("shows-count-chip");
    // table header FOLLOWS the notice (would be PRECEDING with the R3 placement)
    expect(notice.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the count chip / controls row PRECEDES the notice
    expect(notice.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("overflowCount=0 -> no overflow notice", () => {
    render(<ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.queryByTestId("shows-table-overflow")).toBeNull();
  });

  it("empty rows -> empty-state copy (preserve ActiveShowsPanel share hint)", () => {
    render(<ShowsTable rows={[]} now={now} activeCount={0} overflowCount={0} />);
    expect(screen.getByTestId("admin-active-shows-empty").textContent ?? "").toMatch(/share/i);
  });

  it("null title -> slug fallback (preserve ActiveShowsPanel)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "no-title", title: null })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-table-row-no-title").textContent).toContain("no-title");
  });

  it("renders a mobile stacked meta sub-line carrying dates/crew/sync (CSS toggles visibility)", () => {
    render(<ShowsTable rows={[row({ slug: "m" })]} now={now} activeCount={1} overflowCount={0} />);
    const mobile = screen.getByTestId("shows-meta-mobile-m");
    expect(mobile.textContent).toMatch(/crew/);
  });

  // ── M12.3 item 10: clean table structure (header + light row dividers) ──
  it("renders a header row (SHOW/START/END/CREW/SYNC STATUS) sharing the row grid", () => {
    render(<ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={1} overflowCount={0} />);
    const header = screen.getByTestId("shows-table-header");
    const text = (header.textContent ?? "").toLowerCase();
    expect(text).toContain("show");
    expect(text).toContain("start");
    expect(text).toContain("end");
    expect(text).toContain("crew");
    expect(text).toContain("sync status");
  });

  it("rows are separated by light dividers, not per-row boxed cards (divide-y, no per-row border)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "a" }), row({ slug: "b" })]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    // The row links no longer carry their own border/shadow card styling.
    const link = screen.getByTestId("shows-table-row-a");
    expect(link.className).not.toMatch(/\bborder-border\b/);
    expect(link.className).not.toMatch(/shadow-tile/);
    // The list uses divide-y for inter-row dividers.
    const list = link.closest("ul");
    expect(list?.className ?? "").toMatch(/divide-y/);
  });

  // ── M12.3 item 10: working Find filter (was absent — no-op before) ──
  it("renders an accessible Find search input (type=search, aria-label) when rows exist", () => {
    render(<ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={1} overflowCount={0} />);
    const input = screen.getByTestId("shows-find-input") as HTMLInputElement;
    expect(input.type).toBe("search");
    expect(input).toHaveAccessibleName(/find/i);
  });

  it("Find input filters visible rows by title (case-insensitive substring)", () => {
    const rows = [
      row({ slug: "atlas", title: "Atlas Q3 Leadership Summit" }),
      row({ slug: "northwind", title: "Northwind Annual Gala" }),
      row({ slug: "cobalt", title: "Cobalt Product Launch" }),
    ];
    render(<ShowsTable rows={rows} now={now} activeCount={3} overflowCount={0} />);
    // All three visible initially.
    expect(screen.getByTestId("shows-table-row-atlas")).toBeInTheDocument();
    expect(screen.getByTestId("shows-table-row-northwind")).toBeInTheDocument();
    expect(screen.getByTestId("shows-table-row-cobalt")).toBeInTheDocument();

    // Case-insensitive substring on the title → only Northwind matches "annual".
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "ANNUAL" } });
    expect(screen.getByTestId("shows-table-row-northwind")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-table-row-atlas")).toBeNull();
    expect(screen.queryByTestId("shows-table-row-cobalt")).toBeNull();
  });

  it("Find filter falls back to slug when title is null", () => {
    const rows = [
      row({ slug: "no-title", title: null }),
      row({ slug: "named", title: "Named Show" }),
    ];
    render(<ShowsTable rows={rows} now={now} activeCount={2} overflowCount={0} />);
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "no-tit" } });
    expect(screen.getByTestId("shows-table-row-no-title")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-table-row-named")).toBeNull();
  });

  it("Find with no matches shows a no-match notice; clearing restores all rows", () => {
    const rows = [row({ slug: "a", title: "Alpha" }), row({ slug: "b", title: "Beta" })];
    render(<ShowsTable rows={rows} now={now} activeCount={2} overflowCount={0} />);
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "zzz" } });
    const empty = screen.getByTestId("shows-find-empty");
    expect(empty).toBeInTheDocument();
    // Full set is loaded (overflowCount===0) → the unscoped "No shows match" copy
    // is honest: the whole active set really was searched.
    expect(empty.textContent).toMatch(/no shows match/i);
    expect(screen.queryByTestId("shows-table-row-a")).toBeNull();
    // Clearing restores.
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "" } });
    expect(screen.getByTestId("shows-table-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("shows-table-row-b")).toBeInTheDocument();
  });

  it("Find no-match on a CAPPED list scopes the copy to the shown rows (never implies the show does not exist)", () => {
    // rows are capped below activeCount → overflowCount>0. Find only searches the
    // client-loaded rows, so a no-match must NOT read as "this show does not
    // exist" — the copy must disclose it only covered the shown rows and that
    // more aren't loaded (adversarial R1, M12.3 — the row-dropping failure Find
    // had to avoid).
    const rows = [row({ slug: "a", title: "Alpha" }), row({ slug: "b", title: "Beta" })];
    render(<ShowsTable rows={rows} now={now} activeCount={600} overflowCount={598} />);
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "zzz" } });
    const empty = screen.getByTestId("shows-find-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toMatch(/shown shows/i);
    expect(empty.textContent).toMatch(/aren.t loaded/i);
    // must NOT use the unscoped phrasing that implies the full set was searched
    expect(empty.textContent).not.toMatch(/^\s*No shows match/i);
  });

  it("no Find control when there are no shows (empty state owns the surface)", () => {
    render(<ShowsTable rows={[]} now={now} activeCount={0} overflowCount={0} />);
    expect(screen.queryByTestId("shows-find-input")).toBeNull();
  });

  // ── M12.4 item D4: title + Find + bucket toggle share ONE header row ──
  it("header row carries the title and hosts BOTH the Find input and the bucketControl together", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "a" })]}
        now={now}
        activeCount={1}
        overflowCount={0}
        title="Active shows"
        bucketControl={<button data-testid="fake-bucket-control">toggle</button>}
      />,
    );
    const heading = screen.getByRole("heading", { name: "Active shows" });
    const find = screen.getByTestId("shows-find-input");
    const control = screen.getByTestId("fake-bucket-control");
    // Find + control are siblings in the same right-hand cluster of the header.
    const cluster = control.parentElement;
    expect(cluster).not.toBeNull();
    expect(cluster).toContainElement(find);
    // The header row contains the heading too (single source: title lives here).
    // The heading now sits in a left cluster (title + count chip + help) inside
    // the header row, so walk up to the header row (the cluster's parent).
    const headerRow = heading.parentElement?.parentElement;
    expect(headerRow).toContainElement(heading);
    expect(headerRow).toContainElement(control);
    expect(headerRow).toContainElement(find);
  });

  // ── M12.5 item: count chip + HoverHelp next to the Active-shows title ──
  it("header renders the count chip with activeCount and a help trigger", () => {
    render(<ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={42} overflowCount={0} />);
    const chip = screen.getByTestId("shows-count-chip");
    expect(chip.textContent).toBe("42");
    expect(screen.getByTestId("shows-help-trigger")).toBeInTheDocument();
  });

  // ── M12.10: sortable columns ──
  const rowOrder = () =>
    screen
      .getAllByTestId(/^shows-table-row-/)
      .map((el) => (el.getAttribute("data-testid") ?? "").replace("shows-table-row-", ""));

  it("default order is the incoming `rows` order (no sort until a header is clicked)", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "c", title: "Charlie" }),
          row({ slug: "a", title: "Alpha" }),
          row({ slug: "b", title: "Bravo" }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    expect(rowOrder()).toEqual(["c", "a", "b"]);
  });

  it("clicking the Show header sorts by title asc, then desc on a second click", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "c", title: "Charlie" }),
          row({ slug: "a", title: "Alpha" }),
          row({ slug: "b", title: "Bravo" }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-title"));
    expect(rowOrder()).toEqual(["a", "b", "c"]);
    expect(screen.getByTestId("shows-sort-title")).toHaveAttribute(
      "aria-label",
      "Sort by Show, currently ascending",
    );
    fireEvent.click(screen.getByTestId("shows-sort-title"));
    expect(rowOrder()).toEqual(["c", "b", "a"]);
    expect(screen.getByTestId("shows-sort-title")).toHaveAttribute(
      "aria-label",
      "Sort by Show, currently descending",
    );
  });

  it("sorting by Crew is numeric (10 > 2), not lexicographic", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "two", crewCount: 2 }),
          row({ slug: "ten", crewCount: 10 }),
          row({ slug: "one", crewCount: 1 }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-crew"));
    expect(rowOrder()).toEqual(["one", "two", "ten"]);
  });

  it("rows with no start sort LAST on the Start column regardless of direction (nulls last)", () => {
    render(
      <ShowsTable
        rows={[
          row({ slug: "nodate", showDateStart: null, showDateEnd: null }),
          row({ slug: "early", showDateStart: "2026-01-01", showDateEnd: "2026-01-02" }),
          row({ slug: "late", showDateStart: "2026-12-01", showDateEnd: "2026-12-02" }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-start")); // asc
    expect(rowOrder()).toEqual(["early", "late", "nodate"]);
    fireEvent.click(screen.getByTestId("shows-sort-start")); // desc — nulls STILL last
    expect(rowOrder()).toEqual(["late", "early", "nodate"]);
  });

  it("Start and End are INDEPENDENT sort columns, each by its own bound (start-only/end-only rows sort last on the other's column)", () => {
    // Now that Dates is split, each column sorts strictly by its own bound: a
    // row missing that bound renders "—" and sorts LAST there, even if its other
    // bound is present.
    render(
      <ShowsTable
        rows={[
          row({ slug: "endOnly", showDateStart: null, showDateEnd: "2026-06-15" }),
          row({ slug: "startOnly", showDateStart: "2026-03-10", showDateEnd: null }),
          row({ slug: "full", showDateStart: "2026-01-01", showDateEnd: "2026-12-31" }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    // Start asc: full(1/1) < startOnly(3/10) < endOnly(no start → last)
    fireEvent.click(screen.getByTestId("shows-sort-start"));
    expect(rowOrder()).toEqual(["full", "startOnly", "endOnly"]);
    // End asc: endOnly(6/15) < full(12/31) < startOnly(no end → last)
    fireEvent.click(screen.getByTestId("shows-sort-end"));
    expect(rowOrder()).toEqual(["endOnly", "full", "startOnly"]);
  });

  it("Sync sort orders by the VISIBLE health (problems first), not the hidden timestamp", () => {
    // SyncCell only shows the relative time for ok rows, so sorting by
    // lastSyncedAt would reorder non-ok rows by data the user can't see. Sort by
    // bucket severity (warn < review < idle < positive) so the visible dots/labels
    // group. lastSyncedAt is deliberately UNORDERED vs status to prove the sort
    // ignores it: the ok row is newest yet must land last in asc.
    render(
      <ShowsTable
        rows={[
          row({ slug: "ok", lastSyncStatus: "ok", lastSyncedAt: "2026-06-03T11:59:00.000Z" }),
          row({
            slug: "drive",
            lastSyncStatus: "drive_error",
            lastSyncedAt: "2026-06-01T00:00:00.000Z",
          }),
          row({
            slug: "review",
            lastSyncStatus: "pending_review",
            lastSyncedAt: "2026-06-02T00:00:00.000Z",
          }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-sync")); // asc: warn(drive) < review < positive(ok)
    expect(rowOrder()).toEqual(["drive", "review", "ok"]);
    // the visible sync text confirms the dimension that drove the order
    expect(screen.getByTestId("shows-sync-drive").textContent).toContain("Couldn't reach Drive");
    expect(screen.getByTestId("shows-sync-review").textContent).toContain("Changes to review");
    fireEvent.click(screen.getByTestId("shows-sort-sync")); // desc reverses
    expect(rowOrder()).toEqual(["ok", "review", "drive"]);
  });

  // ── M12.12 rows 1 + 4: matrix wiring + conditional restage legend ──
  it("header help carries the matrix root testid and Learn-more target (row 1)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "a", lastSyncStatus: "ok" })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const root = screen.getByTestId("help-affordance--dashboard-active-shows--tooltip");
    // The popover body is closed by default → the Learn-more link is hidden.
    // Scoped to the HoverHelp root so the row <Link> can never satisfy this.
    const link = within(root).getByRole("link", { hidden: true });
    expect(link).toHaveAttribute("href", "/help/admin/dashboard#active-shows");
  });

  // M12.12 follow-up — the legend link's "→" is decorative; aria-label drops
  // it from the accessible name WITHOUT splitting the visible text run
  // (text-run splits shift text-decoration paint — byte-level screenshot
  // drift). Failure mode caught: someone puts the arrow back into the name.
  it("restage legend accessible name drops the decorative → (aria-label), visible text keeps it", () => {
    const reviewRow = row({ slug: "rev", lastSyncStatus: "pending_review", title: "Review Me" });
    render(<ShowsTable rows={[reviewRow]} now={now} activeCount={1} overflowCount={0} />);
    const legend = screen.getByRole("link", { name: "What the sync statuses mean" });
    expect(legend).toHaveAttribute("data-testid", "help-affordance--dashboard-restage--legend");
    expect(legend).toHaveAttribute("aria-label", "What the sync statuses mean");
    expect(legend.textContent).toBe("What the sync statuses mean →");
    expect(legend.firstElementChild).toBeNull();
  });

  it("restage legend renders iff a VISIBLE row has bucket=review, links to re-stage (row 4)", () => {
    // Failure mode caught: an always-on legend (condition replaced by `true`)
    // fails the ok-only re-render below.
    const reviewRow = row({ slug: "rev", lastSyncStatus: "pending_review", title: "Review Me" });
    const okRow = row({ slug: "fine", lastSyncStatus: "ok", title: "Fine Show" });
    render(<ShowsTable rows={[reviewRow, okRow]} now={now} activeCount={2} overflowCount={0} />);
    const legend = screen.getByTestId("help-affordance--dashboard-restage--legend");
    expect(legend).toHaveAttribute("href", "/help/admin/review-queues#re-stage");
    // Re-render with only the ok row → legend absent. Anti-tautology: assert on
    // the legend testid ONLY — the SyncCell's "Changes to review" label must
    // never be able to satisfy a text-based scan.
    cleanup();
    render(<ShowsTable rows={[okRow]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.queryByTestId("help-affordance--dashboard-restage--legend")).toBeNull();
  });

  it("legend follows the FILTERED visible set — Find hiding every review row hides it", () => {
    // Failure mode caught: legend keyed off the UNFILTERED `rows` input array
    // would survive the Find filter and fail here.
    render(
      <ShowsTable
        rows={[
          row({ slug: "z", lastSyncStatus: "pending_review", title: "Zebra" }),
          row({ slug: "al", lastSyncStatus: "ok", title: "Alpha" }),
        ]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("help-affordance--dashboard-restage--legend")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "Alpha" } });
    expect(screen.queryByTestId("help-affordance--dashboard-restage--legend")).toBeNull();
    // Clearing the filter restores the legend (instant — no animation contract).
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "" } });
    expect(screen.getByTestId("help-affordance--dashboard-restage--legend")).toBeInTheDocument();
  });

  it("zero rows → no legend (guard condition)", () => {
    render(<ShowsTable rows={[]} now={now} activeCount={0} overflowCount={0} />);
    expect(screen.queryByTestId("help-affordance--dashboard-restage--legend")).toBeNull();
  });

  it("the sort headers are real 44px tap targets (min-h-tap-min) and the Start/End cells never wrap/truncate", () => {
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    expect(screen.getByTestId("shows-sort-start").className).toContain("min-h-tap-min");
    expect(screen.getByTestId("shows-sort-end").className).toContain("min-h-tap-min");
    // title wraps (no truncate); each date cell holds a single short date, is
    // nowrap and not truncated.
    const link = screen.getByTestId("shows-table-row-rpas");
    expect(link.innerHTML).not.toContain("truncate");
    const startCell = screen.getByTestId("shows-start-rpas");
    const endCell = screen.getByTestId("shows-end-rpas");
    expect(startCell.textContent).toBe("6/1/26");
    expect(endCell.textContent).toBe("6/5/26");
    for (const cell of [startCell, endCell]) {
      expect(cell.className).toContain("whitespace-nowrap");
      expect(cell.className).not.toContain("truncate");
    }
  });

  // ── parse-data-quality-warnings badge (spec §3) ──────────────────────────
  it("T4: badge is queryable by role=img with the derived accessible name; no raw code literal", () => {
    const summary = mkDataGaps({ FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 1 });
    render(
      <ShowsTable
        rows={[row({ slug: "gaps", dataGaps: summary })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const badge = screen.getByRole("img", { name: expectedBadgeName(summary) }); // fails if role="img" dropped
    expect(badge).toHaveAttribute("data-testid", "shows-data-quality-gaps");
    expect(badge).toHaveAccessibleName(expectedBadgeName(summary));
    expect(badge.getAttribute("aria-label")).not.toMatch(
      /FIELD_UNREADABLE|UNKNOWN_SECTION_HEADER|BLOCK_DISAPPEARED/,
    );
  });

  it("T5: renders NO badge when dataGaps is absent or total 0 (instant unmount)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "clean" }), row({ slug: "zero", dataGaps: mkDataGaps({}) })]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.queryByTestId("shows-data-quality-clean")).toBeNull();
    expect(screen.queryByTestId("shows-data-quality-zero")).toBeNull();
  });

  it("T6: singular derived accessible name for total 1", () => {
    const summary = mkDataGaps({ FIELD_UNREADABLE: 1 });
    render(
      <ShowsTable
        rows={[row({ slug: "one", dataGaps: summary })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByRole("img", { name: expectedBadgeName(summary) })).toHaveAccessibleName(
      expectedBadgeName(summary),
    );
  });

  it("T7: badge aria-label AND title are BOTH bounded to 4 classes + '+N more' (cap helper)", () => {
    // 6 distinct classes → cap 4 → aria-label/title end with "+2 more", never the
    // unbounded 6-class join. total reflects the true count (6).
    const summary = mkDataGaps({
      FIELD_UNREADABLE: 1,
      UNKNOWN_SECTION_HEADER: 1,
      BLOCK_DISAPPEARED: 1,
      UNKNOWN_FIELD: 1,
      SCHEDULE_TIME_UNPARSED: 1,
      UNKNOWN_ROLE_TOKEN: 1,
    });
    render(
      <ShowsTable
        rows={[row({ slug: "many", dataGaps: summary })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const badge = screen.getByTestId("shows-data-quality-many");
    const expected = expectedBadgeName(summary); // derived from the cap helper
    expect(badge).toHaveAccessibleName(expected);
    expect(badge.getAttribute("title")).toBe(expected); // title bounded too (Codex plan R2)
    expect(expected).toMatch(/\+2 more$/); // the fixture genuinely exercises the cap
    // and the unbounded 6th-class label never leaks into the name
    expect(badge.getAttribute("aria-label")).not.toMatch(/unrecognized role/);
  });
});

describe("AutoFixChip (Flow 6 6.3 — neutral auto-fixed sibling)", () => {
  const mkAutoFix = (over: Record<string, number>) => ({
    total: Object.values(over).reduce((a, b) => a + b, 0),
    classes: {
      STAGE_WORD_AUTOCORRECTED: 0,
      ROLE_TOKEN_AUTOCORRECTED: 0,
      COLUMN_HEADER_AUTOCORRECTED: 0,
      SECTION_HEADER_AUTOCORRECTED: 0,
      FIELD_LABEL_AUTOCORRECTED: 0,
      ...over,
    },
  });

  it("renders in the LIVE title area (no rowAction) — neutral, distinct from the amber badge", () => {
    // The regression this pins: the chip must render WITHOUT a rowAction (the old
    // row-action-bar surface is dead in the dashboard, which passes no rowAction).
    render(
      <ShowsTable
        rows={[row({ slug: "x", autoFixes: mkAutoFix({ STAGE_WORD_AUTOCORRECTED: 3 }) })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    const chip = screen.getByTestId("shows-auto-fixed-chip-x");
    expect(chip).toHaveTextContent("3");
    expect(chip).toHaveTextContent(/auto-fixed/i);
    // neutral, NOT the amber DataQualityBadge (must not pass by matching status-warn styling):
    expect(chip.className).not.toMatch(/status-warn/);
  });

  it("hides the auto-fixed chip when autoFixes is absent or total 0", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "y" }), row({ slug: "z", autoFixes: mkAutoFix({}) })]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.queryByTestId("shows-auto-fixed-chip-y")).toBeNull();
    expect(screen.queryByTestId("shows-auto-fixed-chip-z")).toBeNull();
  });
});
