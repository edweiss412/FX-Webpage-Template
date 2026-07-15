import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  calls: [] as Array<{ method: string; args: unknown[] }>,
  selectArg: "",
  throwOnFrom: false,
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
    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
        if (method === "select") state.selectArg = args[0] as string;
        return builder;
      };
    for (const m of ["select", "eq", "gte", "not", "order"]) builder[m] = chain(m);
    builder.limit = (...args: unknown[]) => {
      state.calls.push({ method: "limit", args });
      return Promise.resolve({ data: state.rows, error: state.error });
    };
    return { from: chain("from") };
  },
}));

import { querySyncLog } from "@/lib/observe/query/syncLog";

const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  show_id: null,
  drive_file_id: "1N1PK",
  status: "idle",
  message: "sync complete",
  parse_warnings: [],
  duration_ms: 1234,
  occurred_at: "2026-07-15T05:19:14Z",
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
  state.throwOnFrom = false;
});

describe("querySyncLog", () => {
  it("SELECT exact; since on occurred_at (column is occurred_at NOT created_at)", async () => {
    await querySyncLog({ sinceHours: 24 });
    expect(state.selectArg).toBe(
      "id, show_id, drive_file_id, status, message, parse_warnings, duration_ms, occurred_at",
    );
    expect(state.calls.find((c) => c.method === "gte")!.args[0]).toBe("occurred_at");
  });

  it("status is class C (unconstrained text): sanitized, lossless for real values", async () => {
    state.rows = [
      {
        id: "i",
        show_id: null,
        drive_file_id: "d",
        status: `watermark ${TOKEN}`,
        message: `m ${TOKEN}`,
        parse_warnings: "scalar",
        duration_ms: 12,
        occurred_at: "t",
      },
    ];
    const r = await querySyncLog({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.status).toContain("watermark");
    expect(JSON.stringify(r.rows[0])).not.toContain(TOKEN);
    expect(r.rows[0]!.warningCount).toBe(0); // scalar jsonb guard
    expect(r.rows[0]!.warnings).toEqual([]);
  });

  it("filters: show eq, file eq, status eq (raw match for filtering)", async () => {
    await querySyncLog({
      showId: "22222222-2222-4222-8222-222222222222",
      driveFileId: "d",
      status: "watermark",
    });
    const eqArgs = state.calls.filter((c) => c.method === "eq").map((c) => c.args);
    expect(eqArgs).toContainEqual(["show_id", "22222222-2222-4222-8222-222222222222"]);
    expect(eqArgs).toContainEqual(["drive_file_id", "d"]);
    expect(eqArgs).toContainEqual(["status", "watermark"]);
  });

  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await querySyncLog({})).kind).toBe("infra_error");

    state.error = null;
    state.throwOnFrom = true;
    const r = await querySyncLog({});
    expect(r.kind).toBe("infra_error");
    expect(r.kind === "infra_error" ? r.message : "").toBe("sync_log read threw");
  });

  it("non-array parse_warnings jsonb → [] and warningCount 0", async () => {
    state.rows = [{ ...baseRow, parse_warnings: "scalar" }];
    const r = await querySyncLog({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.warnings).toEqual([]);
    expect(r.rows[0]!.warningCount).toBe(0);
  });

  it("default limit 100 when not specified", async () => {
    await querySyncLog({});
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([100]);
  });

  it("respects provided limit", async () => {
    await querySyncLog({ limit: 50 });
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([50]);
  });

  it("maps row fields correctly (camelCase output)", async () => {
    const r = await querySyncLog({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(row.showId).toBe(null);
    expect(row.driveFileId).toBe("1N1PK");
    expect(row.status).toBe("idle");
    expect(row.message).toBe("sync complete");
    expect(row.durationMs).toBe(1234);
    expect(row.occurredAt).toBe("2026-07-15T05:19:14Z");
  });
});
