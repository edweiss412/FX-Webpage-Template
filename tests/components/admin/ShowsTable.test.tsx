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
import type { ActiveShowRow } from "@/components/admin/ActiveShowsPanel";

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
    render(<ShowsTable rows={[row({ slug: "rpas" })]} now={now} activeCount={1} overflowCount={0} />);
    const link = screen.getByTestId("shows-table-row-rpas");
    expect(link.getAttribute("href")).toBe("/admin/show/rpas");
    expect(screen.getByTestId("shows-sync-rpas")).toBeInTheDocument();
    expect(screen.getByTestId("shows-chevron-rpas")).toBeInTheDocument();
    expect(link.textContent).toContain("4 crew");
  });

  it("sync column uses syncStatusBucket ordered priority (drive_error -> warn 'Couldn't reach Drive', not synced)", () => {
    render(
      <ShowsTable rows={[row({ slug: "x", lastSyncStatus: "drive_error" })]} now={now} activeCount={1} overflowCount={0} />,
    );
    const sync = screen.getByTestId("shows-sync-x");
    expect(sync.textContent).toContain("Couldn't reach Drive");
    expect(sync.textContent).not.toMatch(/Synced|Live/);
    expect(within(sync).getByTestId("status-dot-warn")).toBeInTheDocument();
  });

  it("ok sync shows 'Synced {relative}' in the sync column", () => {
    render(<ShowsTable rows={[row({ slug: "ok1", lastSyncStatus: "ok" })]} now={now} activeCount={1} overflowCount={0} />);
    expect(screen.getByTestId("shows-sync-ok1").textContent).toMatch(/Synced/);
  });

  it("Live pill renders by title iff row.isLive (never in sync column)", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "live", isLive: true, lastSyncStatus: "drive_error" }), row({ slug: "dead", isLive: false })]}
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
    const { container } = render(<ShowsTable rows={rows} now={now} activeCount={3} overflowCount={0} />);
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
    render(<ShowsTable rows={[row({ slug: "no-title", title: null })]} now={now} activeCount={1} overflowCount={0} />);
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
    expect(screen.getByTestId("shows-find-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-table-row-a")).toBeNull();
    // Clearing restores.
    fireEvent.change(screen.getByTestId("shows-find-input"), { target: { value: "" } });
    expect(screen.getByTestId("shows-table-row-a")).toBeInTheDocument();
    expect(screen.getByTestId("shows-table-row-b")).toBeInTheDocument();
  });

  it("no Find control when there are no shows (empty state owns the surface)", () => {
    render(<ShowsTable rows={[]} now={now} activeCount={0} overflowCount={0} />);
    expect(screen.queryByTestId("shows-find-input")).toBeNull();
  });
});
