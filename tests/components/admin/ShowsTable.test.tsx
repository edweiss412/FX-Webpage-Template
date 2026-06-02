// @vitest-environment jsdom
// M12.2 Phase A Task 5 — ShowsTable (spec §5.2). Dense table: Show / Dates /
// Crew / Sync + chevron; whole row links to /admin/show/{slug}. Title-area
// Live pill (row.isLive, precomputed — never recomputed) + Publishing badge
// (!published), mutually exclusive. Sync column = HEALTH only via
// syncStatusBucket (decoupled from live/publishing). Overflow notice when
// overflowCount>0. Preserves ActiveShowsPanel empty-state + null-title (V3).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("Publishing badge renders iff !published; mutually exclusive with Live", () => {
    render(
      <ShowsTable
        rows={[row({ slug: "pub", published: false, isLive: false })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-publishing-pub")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-live-pill-pub")).toBeNull();
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
});
