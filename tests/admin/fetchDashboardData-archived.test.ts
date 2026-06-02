// M12.2 Phase B2 Task 6.1 — archived-bucket data fetch (spec §3.1/§3.2).
//
// fetchDashboardData({ bucket }) contract:
//   - default bucket = "active" (back-compat: existing callers pass nothing).
//   - BOTH activeCount (archived=false) AND archivedCount (archived=true) are
//     ALWAYS computed via count-only (head:true) queries, regardless of bucket.
//   - the row LIST is fetched only for the selected bucket
//     (.eq("archived", bucket === "archived")).
//   - archived rows are ordered archived_at DESC NULLS LAST, id.
//   - the pending_syncs needs-attention select now includes
//     triggered_review_items (so a FIRST_SEEN_REVIEW row carries its sentinel).
//   - per-row finalizeOwned is derived (!published && !archived &&
//     !requires_resync) so ShowsTable can render Held vs Publishing… (§3.2).
//
// This mock — unlike tests/admin/fetchDashboardData.test.ts — RECORDS the
// .eq(column, value) predicates so the two same-table head counts and the two
// same-table row lists can be told apart by their archived predicate.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ShowRow = Record<string, unknown> & { archived?: boolean };

type Seed = {
  activeShows?: ShowRow[];
  archivedShows?: ShowRow[];
  activeCount?: number;
  archivedCount?: number;
  syncRows?: Record<string, unknown>[];
  syncCount?: number;
  existenceRows?: Record<string, unknown>[];
};

type Call = {
  table: string;
  head: boolean;
  selectCols: string | null;
  eq: Record<string, unknown>;
  orderCols: string[];
  inCol: string | null;
};

const state = vi.hoisted(() => ({
  seed: {} as Record<string, unknown>,
  calls: [] as Call[],
}));

function makeClient() {
  const seed = state.seed as Seed;
  return {
    from(table: string) {
      const ctx = {
        head: false,
        selectCols: null as string | null,
        eq: {} as Record<string, unknown>,
        orderCols: [] as string[],
        rangeStart: null as number | null,
        rangeEnd: null as number | null,
        inCol: null as string | null,
      };
      const resolve = () => {
        state.calls.push({
          table,
          head: ctx.head,
          selectCols: ctx.selectCols,
          eq: { ...ctx.eq },
          orderCols: [...ctx.orderCols],
          inCol: ctx.inCol,
        });
        if (ctx.head) {
          if (table === "shows") {
            const count =
              ctx.eq.archived === true ? seed.archivedCount ?? 0 : seed.activeCount ?? 0;
            return { data: null, count, error: null };
          }
          if (table === "crew_members") return { data: null, count: 0, error: null };
          if (table === "pending_ingestions") return { data: null, count: 0, error: null };
          if (table === "pending_syncs") return { data: null, count: seed.syncCount ?? 0, error: null };
          return { data: null, count: 0, error: null };
        }
        if (table === "shows" && ctx.inCol === "drive_file_id") {
          return { data: seed.existenceRows ?? [], error: null };
        }
        if (table === "shows") {
          const list = ctx.eq.archived === true ? seed.archivedShows ?? [] : seed.activeShows ?? [];
          return { data: list, error: null };
        }
        if (table === "crew_members") return { data: [], error: null };
        if (table === "pending_ingestions") return { data: [], error: null };
        if (table === "pending_syncs") return { data: seed.syncRows ?? [], error: null };
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {};
      builder.select = (cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (typeof cols === "string") ctx.selectCols = cols;
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        ctx.eq[col] = val;
        return builder;
      };
      builder.is = () => builder;
      builder.order = (col: string) => {
        ctx.orderCols.push(col);
        return builder;
      };
      builder.limit = () => builder;
      builder.in = (col: string) => {
        ctx.inCol = col;
        return builder;
      };
      builder.range = (a: number, b: number) => {
        ctx.rangeStart = a;
        ctx.rangeEnd = b;
        return builder;
      };
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => onf(resolve());
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => makeClient(),
}));
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-03T12:00:00.000Z"),
}));

const DATES = { travelIn: "2026-06-01", set: null, showDays: ["2026-06-03"], travelOut: "2026-06-05" };

async function run(arg?: { bucket?: "active" | "archived" }) {
  const { fetchDashboardData } = await import("@/components/admin/Dashboard");
  return arg === undefined ? fetchDashboardData() : fetchDashboardData(arg);
}

beforeEach(() => {
  state.seed = {};
  state.calls = [];
});
afterEach(() => vi.resetModules());

describe("fetchDashboardData — archived bucket", () => {
  it("default bucket is 'active' (no arg) and returns the active list", async () => {
    state.seed = {
      activeShows: [
        { id: "1", slug: "a", title: "A", drive_file_id: "d1", dates: DATES, venue: null, published: true, requires_resync: false },
      ],
      activeCount: 1,
      archivedCount: 4,
    };
    const r = (await run()) as { rows: Array<{ slug: string }>; activeCount: number; archivedCount: number };
    expect(r.rows.map((x) => x.slug)).toEqual(["a"]);
    expect(r.activeCount).toBe(1);
    // archivedCount is ALWAYS computed (the inactive segment label needs it)
    expect(r.archivedCount).toBe(4);
    // the active LIST query carried .eq(archived,false)
    const listCall = state.calls.find((c) => c.table === "shows" && !c.head && c.inCol === null);
    expect(listCall!.eq.archived).toBe(false);
  });

  it("bucket='archived' fetches the archived list ordered archived_at DESC NULLS LAST, id", async () => {
    state.seed = {
      archivedShows: [
        { id: "1", slug: "x", title: "X", drive_file_id: "d1", dates: DATES, venue: null, published: false, archived: true, archived_at: "2026-05-20T00:00:00Z", requires_resync: false },
      ],
      activeCount: 2,
      archivedCount: 1,
    };
    const r = (await run({ bucket: "archived" })) as {
      rows: Array<{ slug: string; archivedAt: string | null }>;
      activeCount: number;
      archivedCount: number;
    };
    expect(r.rows.map((x) => x.slug)).toEqual(["x"]);
    expect(r.rows[0]!.archivedAt).toBe("2026-05-20T00:00:00Z");
    // BOTH counts still computed regardless of bucket
    expect(r.activeCount).toBe(2);
    expect(r.archivedCount).toBe(1);
    // the LIST query carried .eq(archived,true) and ordered by archived_at
    const listCall = state.calls.find((c) => c.table === "shows" && !c.head && c.inCol === null);
    expect(listCall!.eq.archived).toBe(true);
    expect(listCall!.orderCols).toContain("archived_at");
    expect(listCall!.selectCols).toContain("archived_at");
  });

  it("BOTH count head-queries are issued (active + archived) on either bucket", async () => {
    state.seed = { activeCount: 7, archivedCount: 3, archivedShows: [] };
    await run({ bucket: "archived" });
    const showsHeadCalls = state.calls.filter((c) => c.table === "shows" && c.head);
    expect(showsHeadCalls.some((c) => c.eq.archived === false)).toBe(true);
    expect(showsHeadCalls.some((c) => c.eq.archived === true)).toBe(true);
  });

  it("the pending_syncs needs-attention select includes triggered_review_items", async () => {
    state.seed = {
      activeShows: [],
      activeCount: 0,
      archivedCount: 0,
      syncRows: [{ staged_id: "s1", drive_file_id: "df1", staged_modified_time: "2026-06-02T00:00:00Z", parse_result: { show: { title: "X" } }, triggered_review_items: ["FIRST_SEEN_REVIEW"] }],
      syncCount: 1,
    };
    await run();
    const syncSelect = state.calls.find(
      (c) => c.table === "pending_syncs" && !c.head && c.selectCols !== null,
    );
    expect(syncSelect!.selectCols).toContain("triggered_review_items");
  });

  it("derives finalizeOwned: a Held row (!published,!archived,requires_resync) is NOT finalize-owned", async () => {
    state.seed = {
      activeShows: [
        { id: "1", slug: "held", title: "Held", drive_file_id: "d1", dates: DATES, venue: null, published: false, requires_resync: true },
        { id: "2", slug: "pub", title: "Pub", drive_file_id: "d2", dates: DATES, venue: null, published: false, requires_resync: false },
      ],
      activeCount: 2,
      archivedCount: 0,
    };
    const r = (await run()) as { rows: Array<{ slug: string; finalizeOwned: boolean }> };
    // Held (requires_resync=true) → NOT finalize-owned → renders "Held" pill
    expect(r.rows.find((x) => x.slug === "held")!.finalizeOwned).toBe(false);
    // unpublished w/o requires_resync → finalize-owned → "Publishing…" pill
    expect(r.rows.find((x) => x.slug === "pub")!.finalizeOwned).toBe(true);
  });

  it("a null archived_at row surfaces archivedAt=null (UI renders 'date unknown' + sorts last)", async () => {
    state.seed = {
      archivedShows: [
        { id: "1", slug: "noTime", title: "No time", drive_file_id: "d1", dates: DATES, venue: null, published: false, archived: true, archived_at: null, requires_resync: false },
      ],
      activeCount: 0,
      archivedCount: 1,
    };
    const r = (await run({ bucket: "archived" })) as { rows: Array<{ archivedAt: string | null }> };
    expect(r.rows[0]!.archivedAt).toBeNull();
  });
});
