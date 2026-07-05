// tests/admin/alertCount.test.ts
import { readFileSync } from "node:fs";
import { it, expect, vi, beforeEach } from "vitest";
const state = {
  throwOnConstruct: false,
  throwOnFrom: false,
  returnError: false,
  nullCount: false,
  count: 0,
  notArgs: [] as unknown[][],
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return {
      from: () => {
        if (state.throwOnFrom) throw new Error("boom");
        type Builder = {
          select: () => Builder;
          is: () => Builder;
          not: (...a: unknown[]) => Builder;
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
        b.not = ((...a: unknown[]) => {
          state.notArgs.push(a);
          return b;
        }) as Builder["not"];
        b.then = (f) =>
          f({
            data: null,
            count: state.returnError || state.nullCount ? null : state.count, // nullCount = null count WITHOUT an error
            error: state.returnError ? { message: "rls" } : null,
          });
        return b;
      },
    };
  },
}));
beforeEach(() => {
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  state.returnError = false;
  state.nullCount = false;
  state.count = 0;
  state.notArgs = [];
});

import { fetchUnresolvedAlertCount } from "@/lib/admin/alertCount";
it("returns { kind:'ok', count } on success", async () => {
  state.count = 3;
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "ok", count: 3 });
});
it("returned-error → infra_error", async () => {
  state.returnError = true;
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "infra_error" });
});
it("thrown from() → infra_error (no propagation)", async () => {
  state.throwOnFrom = true;
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "infra_error" });
});
it("client CONSTRUCTION throw → infra_error (degraded bell, never clean no-badge)", async () => {
  state.throwOnConstruct = true;
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "infra_error" });
});
it("null count WITHOUT an error → infra_error (integrity failure, NOT a clean zero)", async () => {
  state.nullCount = true; // { data:null, count:null, error:null } — PostgREST dropped the count
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "infra_error" });
});
it("numeric 0 → clean { kind:'ok', count:0 } (the ONLY clean no-badge state)", async () => {
  state.count = 0;
  expect(await fetchUnresolvedAlertCount()).toEqual({ kind: "ok", count: 0 });
});
it("excludes inbox-routed + info + health codes from the unresolved count clause", async () => {
  state.count = 0;
  await fetchUnresolvedAlertCount();
  const clause = state.notArgs.map((a) => String(a[2] ?? "")).join(" ");
  expect(clause).toContain("SHEET_UNAVAILABLE");
  expect(clause).toContain("PARSE_ERROR_LAST_GOOD");
  // still excludes info-severity (regression)
  expect(clause).toContain("ROLE_FLAGS_NOTICE");
  // NEW (alert-audience-split §5): health codes are excluded from Doug's bell
  // count too — degraded + notice health codes drop out of the amber count.
  expect(clause).toContain("WEBHOOK_TOKEN_INVALID"); // degraded health
  expect(clause).toContain("TILE_SERVER_RENDER_FAILED"); // degraded health
  // Exclusion-not-allowlist: a genuine doug code is NOT in the exclusion clause,
  // so it still counts (unknown codes likewise stay counted — no allowlist).
  expect(clause).not.toContain("DRIVE_FETCH_FAILED");
});
it("invariant 9: destructures { data, error } from the query (not bare { count, error })", () => {
  const src = readFileSync("lib/admin/alertCount.ts", "utf8");
  // data must be destructured (renamed _countData), alongside count + error
  expect(src).toMatch(/const\s*\{\s*data:\s*_countData\s*,\s*count\s*,\s*error\s*\}\s*=\s*await/);
});
