// tests/admin/needsAttentionCount.test.ts (mobile needs-attention Task 2, spec §4.2)
import { readFileSync } from "node:fs";
import { it, expect, vi, beforeEach } from "vitest";

type TableState = {
  count: number | null;
  error: { message: string } | null;
};
const state = {
  throwOnConstruct: false,
  throwOnFrom: false,
  tables: {} as Record<string, TableState>,
};
function resetTables() {
  // 31 + 47 = 78 is underivable from any row-array length the mock could
  // hand back — the ok-path assertion can ONLY pass if the helper reads
  // the head-count `count` field from each table and sums them.
  state.tables = {
    pending_ingestions: { count: 31, error: null },
    pending_syncs: { count: 47, error: null },
    admin_alerts: { count: 0, error: null },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  // Holds rollup Task 5: the badge now reads sync_holds through its OWN
  // service-role client by default. A bare vi.fn() resolves to undefined and
  // collapses the healthy-count and concurrency assertions to infra_error.
  createSupabaseServiceRoleClient: () => {
    const holdsChain = {
      select: () => holdsChain,
      eq: () => holdsChain,
      order: () => holdsChain,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    return { from: () => holdsChain };
  },
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return {
      from: (table: string) => {
        if (state.throwOnFrom) throw new Error("from boom");
        const t = state.tables[table] ?? {
          count: null,
          error: { message: `unexpected table ${table}` },
        };
        type Builder = {
          select: () => Builder;
          is: () => Builder;
          in: () => Builder;
          not: () => Builder;
          eq: () => Builder;
          then: (
            f: (r: {
              data: null;
              count: number | null;
              error: { message: string } | null;
            }) => unknown,
          ) => unknown;
        };
        const b = {} as Builder;
        const pass = () => b;
        b.select = pass;
        b.is = pass;
        b.in = pass;
        b.not = pass;
        b.eq = pass;
        b.then = (f) => f({ data: null, count: t.count, error: t.error });
        return b;
      },
    };
  },
}));

beforeEach(() => {
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  resetTables();
});

import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";

it("ok path SUMS the two head-counts (31 + 47 → 78)", async () => {
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "ok", count: 78 });
});

it("SUMS the third (inbox-routed) stream: 31 + 47 + 5 → 83", async () => {
  state.tables.admin_alerts = { count: 5, error: null };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "ok", count: 83 });
});

it("returned .error on the admin_alerts (sync-problem) count → infra_error", async () => {
  state.tables.admin_alerts = { count: null, error: { message: "rls" } };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("count:null with NO error on admin_alerts → infra_error (integrity failure)", async () => {
  state.tables.admin_alerts = { count: null, error: null };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("numeric 0 + 0 → clean { kind:'ok', count:0 } (the ONLY clean no-badge state)", async () => {
  state.tables.pending_ingestions = { count: 0, error: null };
  state.tables.pending_syncs = { count: 0, error: null };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "ok", count: 0 });
});

it("returned .error on pending_ingestions → infra_error", async () => {
  state.tables.pending_ingestions = { count: null, error: { message: "rls" } };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("returned .error on pending_syncs → infra_error", async () => {
  state.tables.pending_syncs = { count: null, error: { message: "rls" } };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("thrown from() → infra_error (no propagation)", async () => {
  state.throwOnFrom = true;
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("client CONSTRUCTION throw → infra_error (never rejects)", async () => {
  state.throwOnConstruct = true;
  await expect(loadNeedsAttentionCount()).resolves.toEqual({ kind: "infra_error" });
});

it("count:null with NO error on pending_ingestions → infra_error (integrity failure, NOT a clean zero)", async () => {
  state.tables.pending_ingestions = { count: null, error: null };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("count:null with NO error on pending_syncs → infra_error (integrity failure, NOT a clean zero)", async () => {
  state.tables.pending_syncs = { count: null, error: null };
  expect(await loadNeedsAttentionCount()).toEqual({ kind: "infra_error" });
});

it("invariant 9: destructures { data, error } from BOTH queries (not bare { count, error })", () => {
  const src = readFileSync("lib/admin/needsAttentionCount.ts", "utf8");
  // nav-perf Phase 2 (E-lite): the two reads are now Promise.all'd, so each
  // result is destructured from its result variable (ingestionResult/syncResult)
  // rather than directly from `await`. Invariant-9 intent preserved: BOTH still
  // destructure { data, ..., error } (not bare { count, error }).
  expect(src).toMatch(/await Promise\.all\(/);
  expect(src).toMatch(
    /const\s*\{\s*data:\s*_ingestionData\s*,\s*count:\s*ingestionCount\s*,\s*error:\s*ingestionError\s*,?\s*\}\s*=\s*ingestionResult/,
  );
  expect(src).toMatch(
    /const\s*\{\s*data:\s*_syncData\s*,\s*count:\s*syncCount\s*,\s*error:\s*syncError\s*,?\s*\}\s*=\s*syncResult/,
  );
});

// ── Holds rollup Task 5: the badge counts SHOWS with open identity holds (one
// per show, matching the one-card-per-show inbox), not individual holds.
it("adds shows-with-holds via loadOpenIdentityHolds; a holds fault is not maskable by healthy counts", async () => {
  const g = (id: string) => ({
    showId: id,
    slug: id,
    title: null,
    summaries: ["s"],
    newestCreatedAt: "2026-08-03T00:00:00+00:00",
  });
  const ok = await loadNeedsAttentionCount({
    loadHolds: async () => ({ kind: "ok" as const, groups: [g("sA"), g("sB")] }),
  });
  expect(ok).toEqual({ kind: "ok", count: 80 }); // 31+47 pending + 0 sync-problem + 2 hold shows
  const bad = await loadNeedsAttentionCount({
    loadHolds: async () => ({ kind: "infra_error" as const, message: "x" }),
  });
  expect(bad).toEqual({ kind: "infra_error" });
});
