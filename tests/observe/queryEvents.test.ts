import { afterEach, describe, expect, test, vi } from "vitest";

// Hoisted controllable mock of the service-role client.
const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  throwOnFrom: false,
  captured: { table: "", filters: [] as Array<[string, unknown]> },
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
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.from = (table: string) => {
      state.captured.table = table;
      return builder;
    };
    builder.select = chain;
    builder.in = (col: string, v: unknown) => {
      state.captured.filters.push([`in:${col}`, v]);
      return builder;
    };
    builder.eq = (col: string, v: unknown) => {
      state.captured.filters.push([`eq:${col}`, v]);
      return builder;
    };
    builder.gte = (col: string, v: unknown) => {
      state.captured.filters.push([`gte:${col}`, v]);
      return builder;
    };
    builder.ilike = (col: string, v: unknown) => {
      state.captured.filters.push([`ilike:${col}`, v]);
      return builder;
    };
    builder.or = (v: unknown) => {
      state.captured.filters.push([`or`, v]);
      return builder;
    };
    builder.order = chain;
    builder.limit = () => Promise.resolve({ data: state.rows, error: state.error });
    return builder as never;
  },
}));

afterEach(() => {
  state.rows = [];
  state.error = null;
  state.throwOnFrom = false;
  state.captured = { table: "", filters: [] };
  vi.resetModules();
});

function seedRow(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    occurred_at: "2026-07-03T00:00:00.000Z",
    level: "error",
    source: "cron.sync",
    message: "boom happened",
    code: "SOME_CODE",
    request_id: "req-1",
    show_id: null,
    drive_file_id: null,
    actor_hash: null,
    context: {},
    shows: null,
    ...over,
  };
}

describe("queryEvents", () => {
  test("maps rows and applies filters", async () => {
    state.rows = [seedRow()];
    const { queryEvents } = await import("@/lib/observe/query/events");
    // queryEvents mirrors loadAppEvents: it TRUSTS pre-validated AppEventFilters (the CLI's
    // parseObserveArgs / the UI's parseAppEventFilters UUID-guard showId upstream). Unlike
    // queryChangeLog, queryEvents does NOT self-guard showId. So a truthy showId is applied.
    const r = await queryEvents({
      levels: ["error"],
      showId: "11111111-1111-1111-1111-111111111111",
      code: "SOME_CODE",
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("unreachable");
    expect(state.captured.table).toBe("app_events");
    expect(r.events[0]).toMatchObject({ id: seedRow().id, level: "error", message: "boom happened" });
    const keys = state.captured.filters.map((f) => f[0]);
    expect(keys).toContain("in:level");
    expect(keys).toContain("eq:code");
    expect(keys).toContain("eq:show_id");
  });

  test("hasMore + nextCursor when a full page + 1 returns", async () => {
    state.rows = Array.from({ length: 101 }, (_, i) =>
      seedRow({
        id: `1111111${String(i).padStart(11, "0")}`.slice(0, 36),
        occurred_at: `2026-07-0${(i % 9) + 1}T00:00:00.000Z`,
      }),
    );
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({});
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.events.length).toBe(100);
    expect(r.hasMore).toBe(true);
    expect(r.nextCursor).not.toBeNull();
  });

  test("returned {error} → infra_error (no throw)", async () => {
    state.error = { message: "db down" };
    const { queryEvents } = await import("@/lib/observe/query/events");
    expect(await queryEvents({})).toMatchObject({ kind: "infra_error" });
  });

  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { queryEvents } = await import("@/lib/observe/query/events");
    const r = await queryEvents({});
    expect(r.kind).toBe("infra_error");
  });
});
