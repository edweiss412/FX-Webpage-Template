import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  calls: [] as Array<{ method: string; args: unknown[] }>,
  selectArg: "",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      (...args: unknown[]) => {
        state.calls.push({ method, args });
        if (method === "select") state.selectArg = args[0] as string;
        return builder;
      };
    for (const m of ["select", "order"]) builder[m] = chain(m);
    builder.limit = (...args: unknown[]) => {
      state.calls.push({ method: "limit", args });
      return Promise.resolve({ data: state.rows, error: state.error });
    };
    return { from: chain("from") };
  },
}));

import { queryWatchChannels } from "@/lib/observe/query/watch";

const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  watched_folder_id: "1abc2def3ghi4jkl5mno6pqr7stu8vwx",
  resource_id: "res_123",
  expires_at: "2026-08-15T00:00:00Z",
  created_at: "2026-07-15T05:19:14Z",
  activated_at: "2026-07-15T05:20:00Z",
  superseded_at: null,
  stopped_at: null,
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
});

describe("queryWatchChannels", () => {
  it("STRUCTURAL PIN: module source never references webhook_secret and never selects *", () => {
    const src = readFileSync(join(process.cwd(), "lib/observe/query/watch.ts"), "utf8");
    expect(src).not.toContain("webhook_secret");
    expect(src).not.toMatch(/select\(\s*["'`]\s*\*\s*["'`]/);
  });
  it("SELECT is the exact §5.0-allowlisted projection", async () => {
    await queryWatchChannels({});
    expect(state.selectArg).toBe(
      "id, status, watched_folder_id, resource_id, expires_at, created_at, activated_at, superseded_at, stopped_at",
    );
  });
  it("orders created_at desc and applies bound", async () => {
    await queryWatchChannels({ limit: 7 });
    const names = state.calls.map((c) => c.method);
    const orderCall = state.calls.find((c) => c.method === "order")!;
    expect(orderCall.args).toEqual(["created_at", { ascending: false }]);
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([7]);
    expect(names.indexOf("order")).toBeLessThan(names.indexOf("limit"));
  });
  it("default limit 100", async () => {
    const r = await queryWatchChannels({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(state.calls.find((c) => c.method === "limit")!.args).toEqual([100]);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryWatchChannels({})).kind).toBe("infra_error");
  });
  it("maps rows correctly with camelCase field names", async () => {
    const r = await queryWatchChannels({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(row.status).toBe("active");
    expect(row.watchedFolderId).toBe("1abc2def3ghi4jkl5mno6pqr7stu8vwx");
    expect(row.resourceId).toBe("res_123");
    expect(row.expiresAt).toBe("2026-08-15T00:00:00Z");
    expect(row.createdAt).toBe("2026-07-15T05:19:14Z");
    expect(row.activatedAt).toBe("2026-07-15T05:20:00Z");
    expect(row.supersededAt).toBe(null);
    expect(row.stoppedAt).toBe(null);
  });
});
