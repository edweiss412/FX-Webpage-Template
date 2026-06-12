// @vitest-environment jsdom
// M12.2 Phase A Task 5 — ShowsTable (spec §5.2). Dense table: Show / Dates /
// Crew / Sync + chevron; whole row links to /admin/show/{slug}. Title-area
// Live pill (row.isLive, precomputed — never recomputed) + Publishing badge
// (!published), mutually exclusive. Sync column = HEALTH only via
// syncStatusBucket (decoupled from live/publishing). Overflow notice when
// overflowCount>0. Preserves ActiveShowsPanel empty-state + null-title (V3).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";

afterEach(cleanup);

const now = new Date("2026-06-03T12:00:00.000Z");

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 4,
    lastSyncedAt: "2026-06-03T10:00:00.000Z",
    lastSyncStatus: "ok",
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

describe("ShowsTable", () => {
  it("row links to /admin/show/{slug}; renders Show/Dates/Crew/Sync + chevron", () => {
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const link = screen.getByTestId("shows-table-row-rpas");
    expect(link.getAttribute("href")).toBe("/admin/show/rpas");
    expect(screen.getByTestId("shows-sync-rpas")).toBeInTheDocument();
    expect(screen.getByTestId("shows-chevron-rpas")).toBeInTheDocument();
    expect(link.textContent).toContain("4 crew");
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

  it("ok sync shows 'Synced {relative}' in the sync column", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "ok1", lastSyncStatus: "ok" })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-sync-ok1").textContent).toMatch(/Synced/);
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
  it("renders a header row (SHOW/DATES/CREW/SYNC STATUS) sharing the row grid", () => {
    render(<ShowsTable rows={[row({ slug: "a" })]} now={now} activeCount={1} overflowCount={0} />);
    const header = screen.getByTestId("shows-table-header");
    const text = (header.textContent ?? "").toLowerCase();
    expect(text).toContain("show");
    expect(text).toContain("dates");
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

  it("rows with no dates sort LAST regardless of direction (nulls last)", () => {
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
    fireEvent.click(screen.getByTestId("shows-sort-dates")); // asc
    expect(rowOrder()).toEqual(["early", "late", "nodate"]);
    fireEvent.click(screen.getByTestId("shows-sort-dates")); // desc — nulls STILL last
    expect(rowOrder()).toEqual(["late", "early", "nodate"]);
  });

  it("Dates sort uses the END date when start is null (matches the rendered fallback), not 'nulls last'", () => {
    // formatDateRange shows a value when EITHER bound exists, so an end-only row
    // is a VISIBLE date and must sort by that date — never forced last.
    render(
      <ShowsTable
        rows={[
          row({ slug: "endOnly", showDateStart: null, showDateEnd: "2026-06-15" }),
          row({ slug: "earlyStart", showDateStart: "2026-01-01", showDateEnd: "2026-01-02" }),
          row({ slug: "trulyNull", showDateStart: null, showDateEnd: null }),
        ]}
        now={now}
        activeCount={3}
        overflowCount={0}
      />,
    );
    fireEvent.click(screen.getByTestId("shows-sort-dates")); // asc: earlyStart(1/1) < endOnly(6/15) < null
    expect(rowOrder()).toEqual(["earlyStart", "endOnly", "trulyNull"]);
    fireEvent.click(screen.getByTestId("shows-sort-dates")); // desc: endOnly > earlyStart, null still last
    expect(rowOrder()).toEqual(["endOnly", "earlyStart", "trulyNull"]);
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

  it("the sort header is a real 44px tap target (min-h-tap-min) and the dates cell never wraps/truncates", () => {
    render(
      <ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    expect(screen.getByTestId("shows-sort-dates").className).toContain("min-h-tap-min");
    // title wraps (no truncate); dates are nowrap and not truncated
    const link = screen.getByTestId("shows-table-row-rpas");
    expect(link.innerHTML).not.toContain("truncate");
    const datesCell = screen.getByTestId("shows-dates-rpas");
    expect(datesCell.textContent).toBe("6/1/26 → 6/5/26");
    expect(datesCell.className).toContain("whitespace-nowrap");
    expect(datesCell.className).not.toContain("truncate");
  });
});
