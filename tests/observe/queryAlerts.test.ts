import { afterEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  throwOnFrom: false,
  captured: { table: "", selectArg: "", filters: [] as Array<[string, unknown]> },
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
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = (table: string) => {
      state.captured.table = table;
      return b;
    };
    b.select = (arg: string) => {
      state.captured.selectArg = arg;
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
    b.order = chain;
    b.limit = (n: number) => {
      state.captured.filters.push([`limit:${n}`, n]);
      return Promise.resolve({ data: state.rows, error: state.error });
    };
    return b as never;
  },
}));

afterEach(() => {
  state.rows = [];
  state.error = null;
  state.throwOnFrom = false;
  state.captured = { table: "", selectArg: "", filters: [] };
  vi.resetModules();
});

describe("queryAlerts", () => {
  test("selects admin_alerts WITHOUT context, applies openOnly + code, maps camelCase", async () => {
    state.rows = [
      {
        id: "a",
        show_id: null,
        code: "WATCH_CHANNEL_ORPHANED",
        raised_at: "t",
        last_seen_at: "t",
        occurrence_count: 2,
        resolved_at: null,
        resolved_by: null,
        shows: null,
      },
    ];
    const { queryAlerts } = await import("@/lib/observe/query/alerts");
    const r = await queryAlerts({ openOnly: true, code: "WATCH_CHANNEL_ORPHANED", limit: 10 });
    if (r.kind !== "ok") throw new Error("infra");
    expect(state.captured.table).toBe("admin_alerts");
    expect(state.captured.selectArg).not.toContain("context");
    expect(state.captured.filters.map((f) => f[0])).toEqual(
      expect.arrayContaining(["is:resolved_at", "eq:code", "limit:10"]),
    );
    expect(r.alerts[0]).toMatchObject({
      id: "a",
      code: "WATCH_CHANNEL_ORPHANED",
      occurrenceCount: 2,
      resolvedAt: null,
    });
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
});
