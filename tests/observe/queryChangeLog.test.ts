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
    b.eq = (col: string, v: unknown) => {
      state.captured.filters.push([`eq:${col}`, v]);
      return b;
    };
    b.gte = (col: string, v: unknown) => {
      state.captured.filters.push([`gte:${col}`, v]);
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

const UUID = "11111111-1111-1111-1111-111111111111";

describe("queryChangeLog", () => {
  test("selects show_change_log without images; UUID showId applied, non-UUID dropped; null since → no bound", async () => {
    state.rows = [
      {
        id: "c",
        show_id: "s",
        drive_file_id: "d",
        occurred_at: "t",
        source: "auto_apply",
        change_kind: "email",
        entity_ref: null,
        summary: "changed X",
        status: "applied",
      },
    ];
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    await queryChangeLog({ showId: "not-a-uuid" });
    expect(state.captured.table).toBe("show_change_log");
    expect(state.captured.selectArg).not.toMatch(/before_image|after_image/);
    expect(state.captured.filters.map((f) => f[0])).not.toContain("eq:show_id");

    state.captured.filters = [];
    const good = await queryChangeLog({ showId: UUID, sinceHours: null });
    if (good.kind !== "ok") throw new Error("infra");
    const keys = state.captured.filters.map((f) => f[0]);
    expect(keys).toContain("eq:show_id");
    expect(keys).not.toContain("gte:occurred_at"); // null → no bound
    expect(good.changes[0]).toMatchObject({
      id: "c",
      showId: "s",
      driveFileId: "d",
      changeKind: "email",
    });
  });

  test("undefined sinceHours defaults to 24 (adds gte); positive sinceHours adds gte", async () => {
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    await queryChangeLog({});
    expect(state.captured.filters.map((f) => f[0])).toContain("gte:occurred_at");
    state.captured.filters = [];
    await queryChangeLog({ sinceHours: 48 });
    expect(state.captured.filters.map((f) => f[0])).toContain("gte:occurred_at");
  });

  test("limit clamps: 0→1, 999→500, undefined→100", async () => {
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    await queryChangeLog({ limit: 0 });
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:1");
    state.captured.filters = [];
    await queryChangeLog({ limit: 999 });
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:500");
    state.captured.filters = [];
    await queryChangeLog({});
    expect(state.captured.filters.map((f) => f[0])).toContain("limit:100");
  });

  test("returned {error} → infra_error", async () => {
    state.error = { message: "db down" };
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    expect(await queryChangeLog({})).toMatchObject({ kind: "infra_error" });
  });

  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { queryChangeLog } = await import("@/lib/observe/query/changeLog");
    expect(await queryChangeLog({})).toMatchObject({ kind: "infra_error" });
  });
});
