// tests/admin/healthAlerts.test.ts (alert-audience-split Task 8, spec §6.6)
//
// The paginated dev-panel loader. TWO partitioned queries (degraded set, notice
// set), each requesting SIZE+1 rows via .range(page*SIZE, page*SIZE+SIZE) so a
// full page is distinguishable from a larger partition: hasMore = data.length >
// SIZE, rows = data.slice(0, SIZE). Returned/thrown errors → { kind:"infra_error" }.
import { readFileSync } from "node:fs";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { setLogSink, resetLogSink } from "@/lib/log";

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
  // Identity resolver fixtures (routed by the resolver's `.from(table)` reads,
  // filtered by the `.in()` id list) — mirror tests/components/PerShowAlertSection.
  crewRows: [] as Array<{ id: string; show_id: string | null; name: string | null }>,
  showRows: [] as Array<{ id: string; title: string | null; slug: string | null }>,
  // When true, the crew_members/shows reads return a PostgREST { error },
  // driving resolveAlertIdentities → kind:"infra_error" (loader must still
  // return every row + degrade to surviving-only identity, per spec §3.2).
  failIdentityRead: false,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("construct boom");
    return {
      from: (table: string) => {
        if (state.throwOnFrom) throw new Error("from boom");
        // Identity-resolver reads: `.from("crew_members"|"shows").select(cols)
        // .in(col, ids).limit(n)` → { data, error }. Filter by the `.in()` list.
        if (table === "crew_members" || table === "shows") {
          const inFilter: { column: string | null; values: string[] | null } = {
            column: null,
            values: null,
          };
          const rb = {
            select: () => rb,
            in: (column: string, values: string[]) => {
              inFilter.column = column;
              inFilter.values = values;
              return rb;
            },
            limit: (n: number) => {
              if (state.failIdentityRead) {
                return Promise.resolve({
                  data: null,
                  error: { message: "simulated identity read failure" },
                });
              }
              const source =
                table === "crew_members"
                  ? (state.crewRows as Array<Record<string, unknown>>)
                  : (state.showRows as Array<Record<string, unknown>>);
              const rows =
                inFilter.column && inFilter.values
                  ? source.filter((r) => inFilter.values!.includes(r[inFilter.column!] as string))
                  : source;
              return Promise.resolve({ data: rows.slice(0, n), error: null });
            },
          };
          return rb;
        }
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
  state.crewRows = [];
  state.showRows = [];
  state.failIdentityRead = false;
});

afterEach(() => {
  resetLogSink();
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

// ---------------------------------------------------------------------------
// At-a-glance identity (alert-at-a-glance-identity extension to the health UI).
// loadHealthAlerts now RESOLVES a per-row `identityText` (mirrors
// fetchPerShowAlerts): read admin_alerts, then batch-resolve identities.
// includePii:true — the telemetry page is requireDeveloper-gated (raw email OK).
// Each health row uses its OWN show_id (health alerts carry their own scope).
// ---------------------------------------------------------------------------
const IDENT_SHOW_ID = "11111111-1111-4111-8111-111111111111";
const IDENT_CREW_ID = "22222222-2222-4222-8222-222222222222";

function healthRow(overrides: Partial<Row> & { id: string; code: string }): Row {
  return {
    show_id: null,
    context: null,
    occurrence_count: 1,
    raised_at: "2026-05-04T10:00:00.000Z",
    shows: null,
    ...overrides,
  };
}

it("(a) OAUTH_IDENTITY_CLAIMED health row → identityText = 'Crew: <name> · <email> · Show: <title>'", async () => {
  // Crew + show resolved via the row's OWN show_id (crew is show-scoped:
  // crew.show_id must equal the row's effective show). Email is the canonical
  // OAuth user_email, projected without a DB read.
  state.notice = [
    healthRow({
      id: "oauth-1",
      code: "OAUTH_IDENTITY_CLAIMED",
      show_id: IDENT_SHOW_ID,
      context: {
        crew_member_id: IDENT_CREW_ID,
        user_email: "jordan@example.com",
        show_id: IDENT_SHOW_ID,
      },
    }),
  ];
  state.crewRows = [{ id: IDENT_CREW_ID, show_id: IDENT_SHOW_ID, name: "Jordan Lee" }];
  state.showRows = [{ id: IDENT_SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
  const r = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (r.kind !== "ok") throw new Error("expected ok");
  expect(r.rows[0]!.identityText).toBe(
    "Crew: Jordan Lee · jordan@example.com · Show: East Coast Spectacular",
  );
});

it("(b) ROLE_FLAGS_NOTICE health row → identityText carries the crew names + 'N role changes' count (no DB read)", async () => {
  state.notice = [
    healthRow({
      id: "role-1",
      code: "ROLE_FLAGS_NOTICE",
      context: { changes: [{ crew_name: "Alex Kim" }, { crew_name: "Sam Poe" }] },
    }),
  ];
  const r = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (r.kind !== "ok") throw new Error("expected ok");
  const text = r.rows[0]!.identityText ?? "";
  expect(text).toContain("Alex Kim");
  expect(text).toContain("Sam Poe");
  expect(text).toContain("2 role changes");
});

it("(e) resolver infra_error on an OAUTH row → row still returned, SURVIVING email segment shows, degraded event logged", async () => {
  const records: Array<{ source: string; message: string }> = [];
  setLogSink((record) => {
    records.push({ source: record.source, message: record.message });
  });
  // The crew/show reads fail; the email segment (projected from user_email
  // WITHOUT a DB read) survives. Per spec §3.2 partial degradation, the loader
  // keeps the surviving segment AND still returns the row.
  state.failIdentityRead = true;
  state.notice = [
    healthRow({
      id: "oauth-degraded",
      code: "OAUTH_IDENTITY_CLAIMED",
      show_id: IDENT_SHOW_ID,
      context: {
        crew_member_id: IDENT_CREW_ID,
        user_email: "jordan@example.com",
        show_id: IDENT_SHOW_ID,
      },
    }),
  ];
  state.crewRows = [{ id: IDENT_CREW_ID, show_id: IDENT_SHOW_ID, name: "Jordan Lee" }];
  state.showRows = [{ id: IDENT_SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
  const r = await loadHealthAlerts({ weight: "notice", page: 0 });
  if (r.kind !== "ok") throw new Error("expected ok");
  // Row still present; email survives; crew/show labels dropped (failed reads).
  expect(r.rows[0]!.identityText).toBe("jordan@example.com");
  expect(
    records.some(
      (rec) => rec.source === "admin.healthAlerts" && /identity resolve degraded/.test(rec.message),
    ),
  ).toBe(true);
});
