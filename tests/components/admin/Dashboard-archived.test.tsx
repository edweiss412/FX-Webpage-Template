// @vitest-environment jsdom
// M12.2 Phase B2 Task 6.2 — segmented Active/Archived dashboard bucket,
// read-only ArchivedShowRow + Unarchive, and the Held-vs-Publishing pill split
// (spec §3.1/§3.2). jsdom/RTL only — real-browser layout/transition assertions
// are Phase 9.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ArchivedShowRow } from "@/components/admin/ArchivedShowRow";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";

type ShowRow = Record<string, unknown> & { archived?: boolean };
type Seed = {
  activeShows?: ShowRow[];
  archivedShows?: ShowRow[];
  activeCount?: number;
  archivedCount?: number;
  // show ids the finalize-owned RPC (readfinalizeowned_b2) returns true for.
  finalizeOwnedIds?: string[];
};

const state = vi.hoisted(() => ({ seed: {} as Record<string, unknown> }));

function makeClient() {
  const seed = state.seed as Seed;
  return {
    async rpc(_fn: string, args: { p_show_id: string }) {
      return { data: (seed.finalizeOwnedIds ?? []).includes(args.p_show_id), error: null };
    },
    from(table: string) {
      const ctx = { head: false, eq: {} as Record<string, unknown>, inCol: null as string | null };
      const resolve = () => {
        if (ctx.head) {
          if (table === "shows") {
            const count = ctx.eq.archived === true ? seed.archivedCount ?? 0 : seed.activeCount ?? 0;
            return { data: null, count, error: null };
          }
          return { data: null, count: 0, error: null };
        }
        if (table === "shows" && ctx.inCol === "drive_file_id") return { data: [], error: null };
        if (table === "shows") {
          return {
            data: ctx.eq.archived === true ? seed.archivedShows ?? [] : seed.activeShows ?? [],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {};
      builder.select = (_c?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        ctx.eq[col] = val;
        return builder;
      };
      builder.is = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.in = (col: string) => {
        ctx.inCol = col;
        return builder;
      };
      builder.range = () => builder;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => onf(resolve());
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => makeClient() }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

const DATES = { travelIn: "2026-06-01", set: null, showDays: ["2026-06-03"], travelOut: "2026-06-05" };

async function renderDashboard(bucket?: "active" | "archived") {
  const { Dashboard } = await import("@/components/admin/Dashboard");
  render(await Dashboard(bucket ? { bucket } : undefined));
}

beforeEach(() => {
  state.seed = {};
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("Dashboard segmented Active/Archived bucket (§3.1)", () => {
  it("renders a segmented control with Active + Archived (N) chips as <Link>s (server-driven)", async () => {
    state.seed = { activeShows: [], activeCount: 3, archivedCount: 5 };
    await renderDashboard("active");
    const seg = screen.getByTestId("dashboard-bucket-segmented");
    const active = within(seg).getByTestId("dashboard-bucket-active");
    const archived = within(seg).getByTestId("dashboard-bucket-archived");
    // server-driven: each segment is an anchor pointing at ?bucket=…
    expect(active.tagName).toBe("A");
    expect(active.getAttribute("href")).toContain("bucket=active");
    expect(archived.getAttribute("href")).toContain("bucket=archived");
    // the inactive segment shows its count
    expect(archived.textContent).toContain("5");
    // active is the current segment (aria-current)
    expect(active.getAttribute("aria-current")).toBe("page");
  });

  it("archived count 0 → Archived segment renders but is disabled/muted (not a link)", async () => {
    state.seed = { activeShows: [], activeCount: 2, archivedCount: 0 };
    await renderDashboard("active");
    const archived = screen.getByTestId("dashboard-bucket-archived");
    // disabled segment is NOT an anchor (nothing to navigate to)
    expect(archived.tagName).not.toBe("A");
    expect(archived).toHaveAttribute("aria-disabled", "true");
    expect(archived.textContent).toContain("0");
  });

  it("Active segment: a clean Held row (requires_resync=false, no checkpoint) shows 'Held — not published', NOT 'Publishing…'", async () => {
    // REGRESSION: a clean Unarchive catch-up clears requires_resync, so the
    // normal Held state has requires_resync=false. It must STILL be "Held"
    // (it has no active wizard finalize checkpoint → not in finalizeOwnedIds).
    state.seed = {
      activeShows: [
        { id: "held", slug: "held", title: "Held Show", drive_file_id: "d1", dates: DATES, venue: null, published: false, requires_resync: false },
      ],
      activeCount: 1,
      archivedCount: 0,
      finalizeOwnedIds: [], // no active checkpoint
    };
    await renderDashboard("active");
    const heldPill = screen.getByTestId("shows-held-pill-held");
    expect(heldPill.textContent).toMatch(/Held — not published/);
    expect(screen.queryByTestId("shows-publishing-held")).not.toBeInTheDocument();
  });

  it("Active segment: a finalize-owned row (active checkpoint) shows 'Publishing…'", async () => {
    state.seed = {
      activeShows: [
        { id: "pub", slug: "pub", title: "Pub Show", drive_file_id: "d1", dates: DATES, venue: null, published: false, requires_resync: false },
      ],
      activeCount: 1,
      archivedCount: 0,
      finalizeOwnedIds: ["pub"], // active wizard finalize checkpoint
    };
    await renderDashboard("active");
    expect(screen.getByTestId("shows-publishing-pub")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-held-pill-pub")).not.toBeInTheDocument();
  });

  it("Archived segment: renders read-only ArchivedShowRows (title + Archived time + Unarchive + Open; NO re-sync/share)", async () => {
    state.seed = {
      activeShows: [],
      activeCount: 0,
      archivedCount: 1,
      archivedShows: [
        { id: "1", slug: "old-show", title: "Old Show", drive_file_id: "d1", dates: DATES, venue: null, published: false, archived: true, archived_at: "2026-05-20T10:00:00.000Z", requires_resync: false },
      ],
    };
    await renderDashboard("archived");
    const row = screen.getByTestId("archived-show-row-old-show");
    expect(row.textContent).toContain("Old Show");
    expect(row.textContent).toMatch(/Archived/);
    // read-only: Unarchive + Open present; no re-sync / share / rotate controls
    expect(within(row).getByTestId("unarchive-show-button-1")).toBeInTheDocument();
    const open = within(row).getByTestId("archived-show-open-old-show");
    expect(open.getAttribute("href")).toBe("/admin/show/old-show");
    expect(row.textContent).not.toMatch(/Re-sync|Rotate|Share|Copy link/i);
  });

  it("Archived segment empty → 'No archived shows.' empty-state", async () => {
    // (defensive — only reachable if the disabled segment is navigated to directly)
    state.seed = { activeShows: [], activeCount: 0, archivedCount: 0, archivedShows: [] };
    await renderDashboard("archived");
    expect(screen.getByTestId("archived-empty").textContent).toMatch(/No archived shows/i);
  });

  it("ArchivedShowRow with null archived_at renders 'Archived (date unknown)'", () => {
    render(
      <ArchivedShowRow
        row={{
          id: "1",
          slug: "no-time",
          title: "No Time",
          showDateStart: null,
          showDateEnd: null,
          crewCount: 0,
          lastSyncedAt: null,
          lastSyncStatus: null,
          published: false,
          isLive: false,
          finalizeOwned: false,
          archivedAt: null,
        }}
        now={new Date("2026-06-03T12:00:00.000Z")}
        unarchiveAction={async () => {}}
      />,
    );
    expect(screen.getByTestId("archived-show-row-no-time").textContent).toMatch(/Archived \(date unknown\)/);
  });

  it("UnarchiveShowButton renders a one-tap submit inside a form bound to unarchiveAction", () => {
    const action = vi.fn(async () => {});
    render(<UnarchiveShowButton showId="abc" unarchiveAction={action} />);
    const btn = screen.getByTestId("unarchive-show-button-abc");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/Unarchive/);
    // wrapped in a <form> so the React 19 form-action dispatch fires
    expect(btn.closest("form")).not.toBeNull();
    // the button does NOT synchronously disable itself in onClick (B1 lesson —
    // a self-disable cancels the dispatch); it is type=submit, enabled at rest.
    expect((btn as HTMLButtonElement).type).toBe("submit");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
