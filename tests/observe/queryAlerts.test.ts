import { afterEach, describe, expect, test } from "vitest";
import { vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  throwOnFrom: false,
  crewRows: [] as unknown[],
  showRows: [] as unknown[],
  // Table-scoped resolver fault injection (does NOT affect the admin_alerts read).
  resolverErrorTables: new Set<string>(),
  captured: {
    table: "",
    selectArg: "",
    selectByTable: {} as Record<string, string>,
    filters: [] as Array<[string, unknown]>,
    inCalls: [] as Array<[string, string, string[]]>,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnFrom) {
      return {
        from() {
          throw new Error("boom");
        },
      };
    }
    function makeChain(table: string) {
      const b: Record<string, unknown> = {};
      b.select = (arg: string) => {
        if (table === "admin_alerts") state.captured.selectArg = arg;
        state.captured.selectByTable[table] = arg;
        return b;
      };
      b.is = (col: string, v: unknown) => {
        state.captured.filters.push([`is:${col}`, v]);
        return b;
      };
      b.eq = (col: string, v: unknown) => {
        state.captured.filters.push([`eq:${col}`, v]);
        return b;
      };
      b.order = () => b;
      b.in = (col: string, ids: string[]) => {
        state.captured.inCalls.push([table, col, ids]);
        return b;
      };
      b.limit = (n: number) => {
        state.captured.filters.push([`limit:${n}`, n]);
        if (table === "admin_alerts") {
          return Promise.resolve({ data: state.rows, error: state.error });
        }
        if (table === "crew_members") {
          if (state.resolverErrorTables.has("crew_members")) {
            return Promise.resolve({ data: null, error: { message: "boom" } });
          }
          return Promise.resolve({ data: state.crewRows, error: null });
        }
        if (table === "shows") {
          if (state.resolverErrorTables.has("shows")) {
            return Promise.resolve({ data: null, error: { message: "boom" } });
          }
          return Promise.resolve({ data: state.showRows, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      };
      return b;
    }
    return {
      from: (table: string) => {
        state.captured.table = table;
        return makeChain(table);
      },
    } as never;
  },
}));

afterEach(() => {
  state.rows = [];
  state.error = null;
  state.throwOnFrom = false;
  state.crewRows = [];
  state.showRows = [];
  state.resolverErrorTables = new Set<string>();
  state.captured = { table: "", selectArg: "", selectByTable: {}, filters: [], inCalls: [] };
  vi.resetModules();
});

function baseRow(overrides: Record<string, unknown>) {
  return {
    id: "a",
    show_id: null,
    code: "WATCH_CHANNEL_ORPHANED",
    raised_at: "t",
    last_seen_at: "t",
    occurrence_count: 1,
    resolved_at: null,
    resolved_by: null,
    shows: null,
    context: null,
    ...overrides,
  };
}

describe("queryAlerts", () => {
  test("selects admin_alerts WITH context, applies openOnly + code, maps camelCase", async () => {
    state.rows = [baseRow({ occurrence_count: 2 })];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({ openOnly: true, code: "WATCH_CHANNEL_ORPHANED", limit: 10 });
    if (r.kind !== "ok") throw new Error("infra");
    expect(state.captured.table).toBe("admin_alerts");
    expect(state.captured.selectArg).toContain("context");
    expect(state.captured.filters.map((f) => f[0])).toEqual(
      expect.arrayContaining(["is:resolved_at", "eq:code", "limit:10"]),
    );
    expect(r.alerts[0]!).toMatchObject({
      id: "a",
      code: "WATCH_CHANNEL_ORPHANED",
      occurrenceCount: 2,
      resolvedAt: null,
    });
    // WATCH_CHANNEL_ORPHANED is a `global` code -> empty, non-global identity.
    expect(r.alerts[0]!.identity).toEqual({ segments: [], global: true });
  });

  test("limit clamps: 0→1, 999→500, undefined→100", async () => {
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    await queryAlerts({ limit: 0 });
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:1");
    state.captured.filters = [];
    await queryAlerts({ limit: 999 });
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:500");
    state.captured.filters = [];
    await queryAlerts({});
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:100");
  });

  test("empty code is dropped (no eq:code); openOnly absent (no is:resolved_at)", async () => {
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    await queryAlerts({ code: "   " });
    const keys = state.captured.filters.map((f) => f[0]);
    expect(keys).not.toContain("eq:code");
    expect(keys).not.toContain("is:resolved_at");
  });

  test("returned {error} → infra_error", async () => {
    state.error = { message: "db down" };
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    expect(await queryAlerts({})).toMatchObject({ kind: "infra_error" });
  });

  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    expect(await queryAlerts({})).toMatchObject({ kind: "infra_error" });
  });

  test("(a) redaction/no-passthrough: raw context fields never reach AlertRow", async () => {
    const SHOW_ID = "11111111-1111-1111-1111-111111111111";
    const CREW_ID = "22222222-2222-2222-2222-222222222222";
    const DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
    const plantedErrorMessage = "SQLSTATE 23505 duplicate key value violates unique constraint";
    const plantedOrphanUrl = "https://drive.google.com/orphan/xyz";
    state.rows = [
      baseRow({
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: {
          show_id: SHOW_ID,
          crew_member_id: CREW_ID,
          drive_file_id: DRIVE_ID,
          error_message: plantedErrorMessage,
          orphan_url: plantedOrphanUrl,
        },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({});
    if (r.kind !== "ok") throw new Error("infra");
    const row = r.alerts[0]!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "showId",
        "code",
        "raisedAt",
        "lastSeenAt",
        "occurrenceCount",
        "resolvedAt",
        "resolvedBy",
        "showTitle",
        "showSlug",
        "identity",
      ].sort(),
    );
    expect(row).not.toHaveProperty("context");
    expect(row).not.toHaveProperty("resolution");
    const json = JSON.stringify(row);
    expect(json).not.toContain(plantedErrorMessage);
    expect(json).not.toContain(plantedOrphanUrl);
    expect(json).not.toContain(DRIVE_ID);
    expect(json).not.toContain(CREW_ID);
  });

  test("(b) email gating: absent by default, present with includePii", async () => {
    const EMAIL = "someone@example.com";
    state.rows = [
      baseRow({
        code: "OAUTH_IDENTITY_CLAIMED",
        context: { user_email: EMAIL },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");

    const withoutPii = await queryAlerts({});
    if (withoutPii.kind !== "ok") throw new Error("infra");
    const jsonWithout = JSON.stringify(withoutPii.alerts[0]!);
    expect(jsonWithout).not.toContain(EMAIL);
    expect(withoutPii.alerts[0]!.identity.segments.some((s) => s.value === EMAIL)).toBe(false);

    const withPii = await queryAlerts({ includePii: true });
    if (withPii.kind !== "ok") throw new Error("infra");
    const emailSegment = withPii.alerts[0]!.identity.segments.find((s) => s.value === EMAIL);
    expect(emailSegment).toEqual({ label: null, value: EMAIL, pii: true });
  });

  test("(c) sanitization: token always redacted; email redacted only without includePii", async () => {
    const token = "a".repeat(40); // >=24 alnum chars matches TOKEN regex
    const email = "planted@example.com";
    // Space-separated so the sanitizer's TOKEN and EMAIL passes each match
    // their own substring — a contiguous run (no space) would let the
    // greedy `\S+@\S+` EMAIL match swallow the adjacent redacted-token
    // marker too, per sanitizeIdentityString's documented step order.
    state.rows = [
      baseRow({
        code: "LIVE_ROW_CONFLICT",
        context: { file_name: `report ${token} ${email}` },
      }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");

    const withoutPii = await queryAlerts({});
    if (withoutPii.kind !== "ok") throw new Error("infra");
    const sheetSegDefault = withoutPii.alerts[0]!.identity.segments.find(
      (s) => s.label === "Sheet",
    );
    expect(sheetSegDefault?.value).toContain("[redacted-token]");
    expect(sheetSegDefault?.value).toContain("[redacted-email]");
    expect(sheetSegDefault?.value).not.toContain(token);
    expect(sheetSegDefault?.value).not.toContain(email);

    const withPii = await queryAlerts({ includePii: true });
    if (withPii.kind !== "ok") throw new Error("infra");
    const sheetSegPii = withPii.alerts[0]!.identity.segments.find((s) => s.label === "Sheet");
    expect(sheetSegPii?.value).toContain("[redacted-token]");
    expect(sheetSegPii?.value).toContain(email);
    expect(sheetSegPii?.value).not.toContain("[redacted-email]");
  });

  test("(d) resolver infra-fault: alerts still returned ok with valid (possibly empty) identity", async () => {
    const SHOW_ID = "33333333-3333-3333-3333-333333333333";
    state.resolverErrorTables = new Set(["shows"]);
    state.rows = [
      baseRow({
        code: "PICKER_BOOTSTRAP_RPC_FAILED",
        show_id: SHOW_ID,
        context: {},
      }),
      baseRow({ id: "b", code: "WATCH_CHANNEL_ORPHANED", context: {} }),
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({});
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.alerts).toHaveLength(2);
    for (const alert of r.alerts) {
      expect(alert.identity).toHaveProperty("segments");
      expect(alert.identity).toHaveProperty("global");
      expect(Array.isArray(alert.identity.segments)).toBe(true);
    }
    // The show lookup failed -> no Show segment resolvable for the first alert.
    expect(r.alerts[0]!.identity.segments).toEqual([]);
  });
});
