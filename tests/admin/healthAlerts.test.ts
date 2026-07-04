// tests/admin/healthAlerts.test.ts (alert-audience-split Task 8, spec §6.6)
//
// The paginated dev-panel loader. TWO partitioned queries (degraded set, notice
// set), each requesting SIZE+1 rows via .range(page*SIZE, page*SIZE+SIZE) so a
// full page is distinguishable from a larger partition: hasMore = data.length >
// SIZE, rows = data.slice(0, SIZE). Returned/thrown errors → { kind:"infra_error" }.
import { readFileSync } from "node:fs";
import { it, expect, vi, beforeEach } from "vitest";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";

type Row = {
  id: string;
  code: string;
  show_id: string | null;
  context: Record<string, unknown> | null;
  occurrence_count: number;
  raised_at: string;
  shows: { slug: string } | null;
};

const state = {
  throwOnConstruct: false,
  throwOnFrom: false,
  returnError: false,
  degraded: [] as Row[],
  notice: [] as Row[],
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return {
      from: () => {
        if (state.throwOnFrom) throw new Error("from boom");
        let setRows: Row[] = [];
        let from = 0;
        let to = 0;
        type Builder = {
          select: () => Builder;
          in: (col: string, arr: string[]) => Builder;
          is: () => Builder;
          order: () => Builder;
          range: (f: number, t: number) => Builder;
          then: (
            f: (r: { data: Row[] | null; error: { message: string } | null }) => unknown,
          ) => unknown;
        };
        const b = {} as Builder;
        const pass = () => b;
        b.select = pass;
        b.is = pass;
        b.order = pass;
        b.in = ((_col: string, arr: string[]) => {
          setRows = arr.includes(DEGRADED_HEALTH_CODES[0]!) ? state.degraded : state.notice;
          return b;
        }) as Builder["in"];
        b.range = ((f: number, t: number) => {
          from = f;
          to = t;
          return b;
        }) as Builder["range"];
        b.then = (f) => {
          if (state.returnError) return f({ data: null, error: { message: "rls" } });
          return f({ data: setRows.slice(from, to + 1), error: null });
        };
        return b;
      },
    };
  },
}));

import { loadHealthAlerts, HEALTH_PANEL_PAGE_SIZE } from "@/lib/admin/healthAlerts";

const SIZE = HEALTH_PANEL_PAGE_SIZE;

function makeRows(n: number, code: string): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${code}-${i}`,
    code,
    show_id: null,
    context: null,
    occurrence_count: 1,
    raised_at: new Date(2026, 0, 1, 0, i).toISOString(),
    shows: null,
  }));
}

beforeEach(() => {
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  state.returnError = false;
  state.degraded = [];
  state.notice = [];
});

it("construction throw → infra_error", async () => {
  state.throwOnConstruct = true;
  expect(await loadHealthAlerts({ weight: "degraded", page: 0 })).toEqual({ kind: "infra_error" });
});

it("from() throw → infra_error", async () => {
  state.throwOnFrom = true;
  expect(await loadHealthAlerts({ weight: "notice", page: 0 })).toEqual({ kind: "infra_error" });
});

it("returned { error } → infra_error", async () => {
  state.returnError = true;
  expect(await loadHealthAlerts({ weight: "degraded", page: 0 })).toEqual({ kind: "infra_error" });
});

it("degraded partition reads DEGRADED_HEALTH_CODES; notice reads NOTICE_HEALTH_CODES (separate queries)", async () => {
  state.degraded = makeRows(2, DEGRADED_HEALTH_CODES[0]!);
  state.notice = makeRows(3, NOTICE_HEALTH_CODES[0]!);
  const deg = await loadHealthAlerts({ weight: "degraded", page: 0 });
  const not = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (deg.kind !== "ok" || not.kind !== "ok") throw new Error("expected ok");
  expect(deg.rows.map((r) => r.code)).toEqual([
    DEGRADED_HEALTH_CODES[0]!,
    DEGRADED_HEALTH_CODES[0]!,
  ]);
  expect(not.rows.length).toBe(3);
});

it("hasMore true at exactly PAGE_SIZE+1 rows; rows trimmed to PAGE_SIZE (degraded partition)", async () => {
  state.degraded = makeRows(SIZE + 1, DEGRADED_HEALTH_CODES[0]!);
  const r = await loadHealthAlerts({ weight: "degraded", page: 0 });
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows.length).toBe(SIZE);
  expect(r.hasMore).toBe(true);
});

it("hasMore false at exactly PAGE_SIZE rows (degraded partition)", async () => {
  state.degraded = makeRows(SIZE, DEGRADED_HEALTH_CODES[0]!);
  const r = await loadHealthAlerts({ weight: "degraded", page: 0 });
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows.length).toBe(SIZE);
  expect(r.hasMore).toBe(false);
});

it("hasMore true at PAGE_SIZE+1 and false at PAGE_SIZE (notice partition)", async () => {
  state.notice = makeRows(SIZE + 1, NOTICE_HEALTH_CODES[0]!);
  const more = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (more.kind !== "ok") throw new Error("expected ok");
  expect(more.hasMore).toBe(true);
  expect(more.rows.length).toBe(SIZE);

  state.notice = makeRows(SIZE, NOTICE_HEALTH_CODES[0]!);
  const exact = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (exact.kind !== "ok") throw new Error("expected ok");
  expect(exact.hasMore).toBe(false);
});

it("page 1 reads the SECOND window (rows PAGE_SIZE..) — 51st row reachable", async () => {
  state.degraded = makeRows(SIZE + 1, DEGRADED_HEALTH_CODES[0]!);
  const r = await loadHealthAlerts({ weight: "degraded", page: 1 });
  if (r.kind !== "ok") throw new Error("expected ok");
  // window is [SIZE .. SIZE+SIZE] inclusive; only the 51st row (index SIZE) exists
  expect(r.rows.length).toBe(1);
  expect(r.rows[0]!.id).toBe(`id-${DEGRADED_HEALTH_CODES[0]!}-${SIZE}`);
});

it("non-numeric / negative page clamps to 0", async () => {
  state.notice = makeRows(3, NOTICE_HEALTH_CODES[0]!);
  const nan = await loadHealthAlerts({ weight: "notice", page: Number.NaN });
  const neg = await loadHealthAlerts({ weight: "notice", page: -5 });
  if (nan.kind !== "ok" || neg.kind !== "ok") throw new Error("expected ok");
  expect(nan.rows.length).toBe(3);
  expect(neg.rows.length).toBe(3);
});

it("requests SIZE+1 via .range(page*SIZE, page*SIZE+SIZE) and destructures { data, error }", () => {
  const src = readFileSync("lib/admin/healthAlerts.ts", "utf8");
  expect(src).toMatch(/\.range\(/);
  expect(src).toMatch(/HEALTH_PANEL_PAGE_SIZE\s*=\s*50/);
  expect(src).toMatch(/\{\s*data\s*,\s*error\s*\}\s*=\s*await/);
});
