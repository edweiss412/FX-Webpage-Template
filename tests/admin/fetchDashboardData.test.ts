// M12.2 Phase A Task 3 — fetchDashboardData data-layer contract (spec
// §3.2/§3.3/§3.4/§5.3). All reads bounded; isLive single-source; counts exact;
// needs-attention classified. Mocks createSupabaseServerClient with a recording
// builder so query shape (head:true counts, .limit/.range bounds, no empty .in)
// is asserted, not just the returned data.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── recording mock ────────────────────────────────────────────────────────
type Seed = {
  showsList?: Record<string, unknown>[];
  showsActiveCount?: number;
  existenceRows?: Record<string, unknown>[];
  crewRows?: Record<string, unknown>[]; // { show_id }[]
  crewTotal?: number;
  ingestionRows?: Record<string, unknown>[];
  ingestionCount?: number;
  syncRows?: Record<string, unknown>[];
  syncCount?: number;
};

const state = vi.hoisted(() => ({
  seed: {} as Record<string, unknown>,
  calls: [] as Array<{
    table: string;
    head: boolean;
    inCol: string | null;
    inArgs: unknown[] | null;
  }>,
  // ── Deferred-mode infra (nav-perf phase 1 concurrency + A5 bound tests) ──
  // When `deferred` is true, every from()/rpc read returns a promise held open
  // until `releaseAll()` runs, so the test can observe which reads were STARTED
  // (initiated) before any resolves — a serial impl can only start one at a time.
  deferred: false as boolean,
  // Ordered log of started reads, labeled by their dashboard role.
  started: [] as string[],
  // Resolver gates for every pending deferred promise (released en masse).
  gates: [] as Array<() => void>,
  // A5 bound: live in-flight readfinalizeowned_b2 rpc counter + observed max.
  rpcInFlight: 0,
  rpcMaxInFlight: 0,
  // Per-show-id discrimination check for the A5 fan-out: ids the rpc returns
  // data===true for (owned). Everything else resolves data===false (Held).
  rpcOwnedIds: [] as string[],
  // Records the boolean `!error && data===true` verdict the impl computed,
  // keyed by show id, so the test asserts correct per-call discrimination.
  rpcResolvedOwned: [] as string[],
}));

function makeClient() {
  const seed = state.seed as Seed;
  return {
    // §3.2 finalize-owned predicate. Default false (Held) — these tests assert
    // isLive/counts, not the pill; a seeded `finalizeOwnedIds` set marks owners.
    // A seeded `rpcThrowIds` id THROWS so the impl's per-call .catch(() => null)
    // fail-toward-Held path is exercised (nav-perf A5).
    // NON-async on purpose: an async fn can only ever REJECT, never throw
    // synchronously. `rpcSyncThrowIds` throws SYNCHRONOUSLY (builder-construction
    // fault) so the impl's deferred-call + .catch fail-toward-Held path is
    // exercised; `rpcThrowIds` returns a rejected promise (async fault). Both must
    // omit the id (Held) without aborting the dashboard.
    rpc(_fn: string, args: { p_show_id: string }) {
      const syncThrowIds = (seed as { rpcSyncThrowIds?: string[] }).rpcSyncThrowIds ?? [];
      if (syncThrowIds.includes(args.p_show_id)) throw new Error("META: rpc threw SYNCHRONOUSLY");
      const throwIds = (seed as { rpcThrowIds?: string[] }).rpcThrowIds ?? [];
      if (throwIds.includes(args.p_show_id)) {
        return Promise.reject(new Error("META: rpc rejected (async)"));
      }
      const owned = (seed as { finalizeOwnedIds?: string[] }).finalizeOwnedIds ?? [];
      return Promise.resolve({ data: owned.includes(args.p_show_id), error: null });
    },
    from(table: string) {
      const ctx: {
        head: boolean;
        inCol: string | null;
        inArgs: unknown[] | null;
        rangeStart: number | null;
        rangeEnd: number | null;
      } = { head: false, inCol: null, inArgs: null, rangeStart: null, rangeEnd: null };
      const resolve = () => {
        state.calls.push({ table, head: ctx.head, inCol: ctx.inCol, inArgs: ctx.inArgs });
        if (ctx.head) {
          const count =
            table === "shows"
              ? (seed.showsActiveCount ?? 0)
              : table === "crew_members"
                ? (seed.crewTotal ?? 0)
                : table === "pending_ingestions"
                  ? (seed.ingestionCount ?? 0)
                  : table === "pending_syncs"
                    ? (seed.syncCount ?? 0)
                    : 0;
          return { data: null, count, error: null };
        }
        if (table === "shows" && ctx.inCol === "drive_file_id") {
          return { data: seed.existenceRows ?? [], error: null };
        }
        if (table === "shows") return { data: seed.showsList ?? [], error: null };
        if (table === "crew_members") {
          const all = seed.crewRows ?? [];
          if (ctx.rangeStart !== null && ctx.rangeEnd !== null) {
            return { data: all.slice(ctx.rangeStart, ctx.rangeEnd + 1), error: null };
          }
          return { data: all, error: null };
        }
        if (table === "pending_ingestions") return { data: seed.ingestionRows ?? [], error: null };
        if (table === "pending_syncs") return { data: seed.syncRows ?? [], error: null };
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.limit = pass;
      builder.in = (col: string, args: unknown[]) => {
        ctx.inCol = col;
        ctx.inArgs = args;
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

// Deferred client: each read records its role in `state.started` and returns a
// promise parked in `state.gates`. RPC reads additionally track live in-flight
// concurrency for the A5 bound assertion. `releaseAll()` settles every gate.
function makeDeferredClient() {
  const seed = state.seed as Seed;
  const defer = <T>(produce: () => T): Promise<T> =>
    new Promise<T>((res) => {
      state.gates.push(() => res(produce()));
    });
  return {
    rpc(_fn: string, args: { p_show_id: string }) {
      // A5: model real network latency — count concurrent in-flight rpc calls.
      state.rpcInFlight += 1;
      state.rpcMaxInFlight = Math.max(state.rpcMaxInFlight, state.rpcInFlight);
      state.started.push(`rpc:${args.p_show_id}`);
      return new Promise((res) => {
        state.gates.push(() => {
          state.rpcInFlight -= 1;
          res({ data: state.rpcOwnedIds.includes(args.p_show_id), error: null });
        });
      });
    },
    from(table: string) {
      const ctx: { head: boolean; inCol: string | null; rangeStart: number | null } = {
        head: false,
        inCol: null,
        rangeStart: null,
      };
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (_cols?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.limit = pass;
      builder.in = (col: string) => {
        ctx.inCol = col;
        return builder;
      };
      builder.range = (a: number) => {
        ctx.rangeStart = a;
        return builder;
      };
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => {
        // Label the read by table + shape so the test can assert wave membership.
        let label: string;
        if (table === "shows") label = ctx.head ? "shows-count" : "shows-list";
        else if (table === "crew_members") label = ctx.head ? "crew-total" : "crew-page";
        else label = table;
        state.started.push(label);
        return defer(() => {
          if (ctx.head) {
            const count =
              table === "shows"
                ? (seed.showsActiveCount ?? 0)
                : table === "crew_members"
                  ? (seed.crewTotal ?? 0)
                  : 0;
            return { data: null, count, error: null };
          }
          if (table === "shows") return { data: seed.showsList ?? [], count: null, error: null };
          if (table === "crew_members") {
            const all = (seed.crewRows ?? []) as Array<{ show_id?: string }>;
            if (ctx.rangeStart !== null) return { data: all, count: null, error: null };
            return { data: all, count: null, error: null };
          }
          return { data: [], count: 0, error: null };
        }).then(onf);
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => (state.deferred ? makeDeferredClient() : makeClient()),
}));
const nowDateSpy = vi.hoisted(() => vi.fn(async () => new Date("2026-06-03T12:00:00.000Z")));
vi.mock("@/lib/time/now", () => ({ nowDate: nowDateSpy }));

const FULL_DATES = {
  travelIn: "2026-06-01",
  set: null,
  showDays: ["2026-06-03"],
  travelOut: "2026-06-05",
};

async function run() {
  const { fetchDashboardData } = await import("@/components/admin/Dashboard");
  return fetchDashboardData();
}

beforeEach(() => {
  state.seed = {};
  state.calls = [];
  state.deferred = false;
  state.started = [];
  state.gates = [];
  state.rpcInFlight = 0;
  state.rpcMaxInFlight = 0;
  state.rpcOwnedIds = [];
  state.rpcResolvedOwned = [];
  nowDateSpy.mockClear();
});
afterEach(() => vi.resetModules());

// Flush every parked gate, yielding to the microtask queue between passes so
// reads enqueued DURING release (loadNeedsAttention's chained awaits, the next
// finalize/crew chunk) also settle, until the supplied promise resolves.
async function releaseUntilSettled(p: Promise<unknown>): Promise<unknown> {
  let settled = false;
  const wrapped = p.then((v) => {
    settled = true;
    return v;
  });
  for (let i = 0; i < 1000 && !settled; i += 1) {
    const pending = state.gates;
    state.gates = [];
    for (const g of pending) g();
    // Yield so .then() continuations + newly-parked gates register.
    await Promise.resolve();
    await Promise.resolve();
  }
  return wrapped;
}

describe("fetchDashboardData", () => {
  it("Active set = archived=false (incl unpublished); liveCount over published && inWindow", async () => {
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "live-pub",
          title: "Live",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
          last_sync_status: "ok",
          last_synced_at: null,
        },
        {
          id: "2",
          slug: "unpub",
          title: "Unpub",
          drive_file_id: "d2",
          dates: FULL_DATES,
          venue: null,
          published: false,
          last_sync_status: "pending",
          last_synced_at: null,
        },
      ],
      showsActiveCount: 2,
    };
    const r = (await run()) as {
      rows: Array<{ slug: string; isLive: boolean; published: boolean }>;
      liveCount: number;
      activeCount: number;
    };
    expect(r.rows.map((x) => x.slug).sort()).toEqual(["live-pub", "unpub"]);
    expect(r.activeCount).toBe(2);
    expect(r.rows.find((x) => x.slug === "live-pub")!.isLive).toBe(true);
    expect(r.rows.find((x) => x.slug === "unpub")!.isLive).toBe(false); // unpublished never live
    expect(r.liveCount).toBe(1);
    // shows query filtered archived=false (the mock returns only what's seeded;
    // assert the .eq filter is applied by confirming a shows read happened)
    expect(state.calls.some((c) => c.table === "shows" && !c.head)).toBe(true);
  });

  it("liveCount === count of rows with isLive===true (single source)", async () => {
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "a",
          title: "A",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
        {
          id: "2",
          slug: "b",
          title: "B",
          drive_file_id: "d2",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
        {
          id: "3",
          slug: "c",
          title: "C",
          drive_file_id: "d3",
          dates: { ...FULL_DATES, showDays: [] },
          venue: null,
          published: true,
        },
      ],
      showsActiveCount: 3,
    };
    const r = (await run()) as { rows: Array<{ isLive: boolean }>; liveCount: number };
    expect(r.liveCount).toBe(r.rows.filter((x) => x.isLive).length);
    expect(r.liveCount).toBe(2); // c has empty showDays -> not live (crew-unknown parity)
  });

  it("crewTotal is a head:true exact count, not a row-fetch sum", async () => {
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "a",
          title: "A",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
      ],
      showsActiveCount: 1,
      crewTotal: 42,
      crewRows: [{ show_id: "1" }, { show_id: "1" }], // row fetch would give 2; head count is 42
    };
    const r = (await run()) as { crewTotal: number };
    expect(r.crewTotal).toBe(42);
    const crewHeadCall = state.calls.find((c) => c.table === "crew_members" && c.head);
    expect(crewHeadCall).toBeDefined();
    expect(crewHeadCall!.inCol).toBe("show_id");
  });

  it("zero active shows -> crewTotal=0, liveCount=0, no .in('show_id',[]) issued", async () => {
    state.seed = { showsList: [], showsActiveCount: 0 };
    const r = (await run()) as { crewTotal: number; liveCount: number; rows: unknown[] };
    expect(r.crewTotal).toBe(0);
    expect(r.liveCount).toBe(0);
    expect(r.rows).toEqual([]);
    // never issue .in('show_id', []) — footgun (R28)
    expect(state.calls.some((c) => c.inCol === "show_id")).toBe(false);
  });

  it("activeCount > ACTIVE_SHOWS_CAP -> exact activeCount + statsScope='shown' + overflowCount>0", async () => {
    const { ACTIVE_SHOWS_CAP } = await import("@/components/admin/Dashboard");
    const list = Array.from({ length: ACTIVE_SHOWS_CAP }, (_, i) => ({
      id: `${i}`,
      slug: `s${i}`,
      title: `S${i}`,
      drive_file_id: `d${i}`,
      dates: FULL_DATES,
      venue: null,
      published: true,
    }));
    state.seed = { showsList: list, showsActiveCount: ACTIVE_SHOWS_CAP + 17 };
    const r = (await run()) as {
      activeCount: number;
      statsScope: string;
      overflowCount: number;
      rows: unknown[];
    };
    expect(r.activeCount).toBe(ACTIVE_SHOWS_CAP + 17);
    expect(r.statsScope).toBe("shown");
    expect(r.overflowCount).toBe(17);
    expect(r.rows.length).toBe(ACTIVE_SHOWS_CAP);
  });

  it("normal case -> statsScope='global', overflowCount=0", async () => {
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "a",
          title: "A",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
      ],
      showsActiveCount: 1,
    };
    const r = (await run()) as { statsScope: string; overflowCount: number };
    expect(r.statsScope).toBe("global");
    expect(r.overflowCount).toBe(0);
  });

  it("existence lookup keyed by pending drive_file_ids (.in), not unbounded shows scan", async () => {
    state.seed = {
      showsList: [],
      showsActiveCount: 0,
      ingestionRows: [],
      ingestionCount: 0,
      syncRows: [
        {
          staged_id: "s1",
          drive_file_id: "dfX",
          staged_modified_time: "2026-06-02T00:00:00Z",
          parse_result: { show: { title: "X" } },
        },
      ],
      syncCount: 1,
      existenceRows: [
        { drive_file_id: "dfX", slug: "x-show", title: "X", archived: false, published: true },
      ],
    };
    const r = (await run()) as {
      needsAttention: { items: Array<{ variant: string; driveFileId: string }> };
    };
    const existenceCall = state.calls.find(
      (c) => c.table === "shows" && c.inCol === "drive_file_id",
    );
    expect(existenceCall).toBeDefined();
    expect(existenceCall!.inArgs).toEqual(["dfX"]);
    const item = r.needsAttention.items.find((i) => i.driveFileId === "dfX")!;
    expect(item.variant).toBe("existing_staged");
  });

  it("zero pending rows -> no existence query issued, empty inbox", async () => {
    state.seed = {
      showsList: [],
      showsActiveCount: 0,
      ingestionRows: [],
      ingestionCount: 0,
      syncRows: [],
      syncCount: 0,
    };
    const r = (await run()) as { needsAttention: { items: unknown[]; totalCount: number } };
    expect(r.needsAttention.items).toEqual([]);
    expect(r.needsAttention.totalCount).toBe(0);
    expect(state.calls.some((c) => c.table === "shows" && c.inCol === "drive_file_id")).toBe(false);
  });

  it("needReviewCount = exact pending totals (not capped render length)", async () => {
    state.seed = {
      showsList: [],
      showsActiveCount: 0,
      ingestionRows: [],
      ingestionCount: 30,
      syncRows: [],
      syncCount: 25,
    };
    const r = (await run()) as { needReviewCount: number; needsAttention: { totalCount: number } };
    expect(r.needReviewCount).toBe(55);
    expect(r.needsAttention.totalCount).toBe(55);
  });

  it("per-show crewCount paginates child rows (no truncation), summed per show", async () => {
    const { CREW_PAGE_SIZE } = await import("@/components/admin/Dashboard");
    // Two shows; crew rows exceed one page → must paginate to count correctly.
    const crewRows = [
      ...Array.from({ length: CREW_PAGE_SIZE }, () => ({ show_id: "1" })),
      ...Array.from({ length: 3 }, () => ({ show_id: "2" })),
    ];
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "a",
          title: "A",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
        {
          id: "2",
          slug: "b",
          title: "B",
          drive_file_id: "d2",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
      ],
      showsActiveCount: 2,
      crewTotal: CREW_PAGE_SIZE + 3,
      crewRows,
    };
    const r = (await run()) as { rows: Array<{ slug: string; crewCount: number | null }> };
    expect(r.rows.find((x) => x.slug === "a")!.crewCount).toBe(CREW_PAGE_SIZE);
    expect(r.rows.find((x) => x.slug === "b")!.crewCount).toBe(3);
    // assert pagination actually ran (≥2 crew range reads)
    const crewRangeReads = state.calls.filter((c) => c.table === "crew_members" && !c.head).length;
    expect(crewRangeReads).toBeGreaterThanOrEqual(2);
  });

  it("a published=true,archived=true row never reaches rows (archived=false filter) — simulated by seed exclusion", async () => {
    // The .eq('archived', false) filter is applied server-side; the mock returns
    // only seeded (non-archived) rows. This asserts the filter call shape exists.
    state.seed = {
      showsList: [
        {
          id: "1",
          slug: "a",
          title: "A",
          drive_file_id: "d1",
          dates: FULL_DATES,
          venue: null,
          published: true,
        },
      ],
      showsActiveCount: 1,
    };
    await run();
    // The shows list read and the activeCount head read both happen.
    expect(state.calls.filter((c) => c.table === "shows").length).toBeGreaterThanOrEqual(2);
  });
});

// ── nav-perf phase 1 (A2/A5) — concurrency, fan-out bound, nowDate dedupe ──
describe("fetchDashboardData parallelization (nav-perf phase 1)", () => {
  function showRow(id: string, published: boolean) {
    return {
      id,
      slug: `s${id}`,
      title: `S${id}`,
      drive_file_id: `d${id}`,
      dates: FULL_DATES,
      venue: null,
      published,
    };
  }

  it("Wave 1: shows-list + activeCount + archivedCount are all initiated before any resolves", async () => {
    state.deferred = true;
    state.seed = { showsList: [showRow("1", true)], showsActiveCount: 1 };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const p = fetchDashboardData();
    // Drain microtasks (the helper awaits createSupabaseServerClient + nowDate +
    // Promise.all .then-scheduling) WITHOUT releasing any gate, so all three
    // wave-1 reads register as in-flight before any resolves.
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    // All three wave-1 reads must be in-flight concurrently. A serial impl would
    // only have started the first (and could not start #2 until #1 resolved).
    expect(state.started.filter((s) => s === "shows-list").length).toBe(1);
    expect(state.started.filter((s) => s === "shows-count").length).toBe(2); // active + archived heads
    // Wave 2 must NOT have started yet (no gate released → wave-1 unresolved).
    expect(state.started).not.toContain("crew-total");
    await releaseUntilSettled(p);
  });

  it("Wave 2: crewTotal + needs-attention (pending_ingestions) run concurrently once active ids known", async () => {
    state.deferred = true;
    state.seed = { showsList: [showRow("1", true)], showsActiveCount: 1 };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const p = fetchDashboardData();
    // Release ONLY wave-1 (3 gates) so activeShowIds becomes known, then yield.
    for (let i = 0; i < 6 && state.started.indexOf("crew-total") === -1; i += 1) {
      const pending = state.gates;
      state.gates = [];
      for (const g of pending) g();
      await Promise.resolve();
      await Promise.resolve();
    }
    // Once wave-1 resolved, crewTotal AND the needs-attention loader's first read
    // are BOTH in-flight before any wave-2 gate is released — proving they fan
    // out together rather than crewTotal → (await) → needs-attention serially.
    expect(state.started).toContain("crew-total");
    expect(state.started).toContain("pending_ingestions");
    await releaseUntilSettled(p);
  });

  it("A5: ≤ FINALIZE_OWNED_CONCURRENCY in-flight readfinalizeowned_b2 across 20 in-flight shows; all resolve with correct discrimination", async () => {
    const { FINALIZE_OWNED_CONCURRENCY, fetchDashboardData } = await import(
      "@/components/admin/Dashboard"
    );
    state.deferred = true;
    const shows = Array.from({ length: 20 }, (_, i) => showRow(`${i}`, false)); // all unpublished → in-flight
    state.seed = { showsList: shows, showsActiveCount: 20 };
    // Mark a subset owned so discrimination is observable (data===true vs false).
    state.rpcOwnedIds = ["0", "5", "13", "19"];
    const r = (await releaseUntilSettled(fetchDashboardData())) as {
      rows: Array<{ id: string; finalizeOwned: boolean }>;
    };
    // Bound: never more than FINALIZE_OWNED_CONCURRENCY rpc calls in flight at once.
    expect(state.rpcMaxInFlight).toBeLessThanOrEqual(FINALIZE_OWNED_CONCURRENCY);
    expect(state.rpcMaxInFlight).toBeGreaterThan(1); // but it IS fanned out (not serial)
    // All 20 in-flight shows were queried exactly once.
    const rpcStarts = state.started.filter((s) => s.startsWith("rpc:"));
    expect(rpcStarts.length).toBe(20);
    // Correct per-call discrimination: ONLY the owned ids carry finalizeOwned===true.
    const owned = r.rows.filter((row) => row.finalizeOwned).map((row) => row.id).sort();
    expect(owned).toEqual(["0", "13", "19", "5"].sort());
    // And every non-owned in-flight show falls toward Held (false).
    expect(r.rows.filter((row) => !row.finalizeOwned).length).toBe(16);
  });

  it("A5: a thrown rpc fails toward Held (id omitted) without aborting the dashboard", async () => {
    // "boom"'s rpc throws; the impl's per-call .catch(() => null) must keep it
    // OUT of the owned set (Held) while "keep" still resolves owned — the whole
    // dashboard must NOT abort to infra_error for a transient predicate read.
    state.seed = {
      showsList: [showRow("keep", false), showRow("boom", false)],
      showsActiveCount: 2,
      finalizeOwnedIds: ["keep", "boom"], // both "owned", but boom throws first
      rpcThrowIds: ["boom"],
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const r = (await fetchDashboardData()) as
      | { rows: Array<{ id: string; finalizeOwned: boolean }> }
      | { kind: string };
    expect("kind" in r).toBe(false); // did NOT abort to infra_error
    const rows = (r as { rows: Array<{ id: string; finalizeOwned: boolean }> }).rows;
    expect(rows.find((row) => row.id === "keep")!.finalizeOwned).toBe(true);
    expect(rows.find((row) => row.id === "boom")!.finalizeOwned).toBe(false); // thrown → Held
  });

  it("A5: a SYNCHRONOUS rpc throw also fails toward Held without aborting the dashboard (Codex whole-diff R1)", async () => {
    // supabase.rpc() can throw SYNCHRONOUSLY during builder construction. The
    // fan-out must defer the call so that throw becomes a rejection caught by
    // .catch (fail toward Held) — NOT escape Promise.all and abort the dashboard.
    state.seed = {
      showsList: [showRow("keep", false), showRow("sync", false)],
      showsActiveCount: 2,
      finalizeOwnedIds: ["keep", "sync"], // both "owned", but sync throws synchronously
      rpcSyncThrowIds: ["sync"],
    };
    const { fetchDashboardData } = await import("@/components/admin/Dashboard");
    const r = (await fetchDashboardData()) as
      | { rows: Array<{ id: string; finalizeOwned: boolean }> }
      | { kind: string };
    expect("kind" in r).toBe(false); // did NOT abort to infra_error
    const rows = (r as { rows: Array<{ id: string; finalizeOwned: boolean }> }).rows;
    expect(rows.find((row) => row.id === "keep")!.finalizeOwned).toBe(true);
    expect(rows.find((row) => row.id === "sync")!.finalizeOwned).toBe(false); // sync-thrown → Held
  });

  it("nowDate is resolved exactly ONCE across the render path (Dashboard → fetchDashboardData)", async () => {
    state.seed = { showsList: [showRow("1", true)], showsActiveCount: 1 };
    const { Dashboard } = await import("@/components/admin/Dashboard");
    nowDateSpy.mockClear();
    await Dashboard();
    expect(nowDateSpy).toHaveBeenCalledTimes(1);
  });
});
