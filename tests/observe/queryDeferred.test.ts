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

vi.mock("@/lib/adminAlerts/sanitizeIdentityString", () => ({
  sanitizeIdentityString: (s: string | null, _opts: unknown) => {
    if (s === null) return "";
    return s.replace(/[A-F0-9]{32}/g, "");
  },
}));

import { queryDeferred } from "@/lib/observe/query/deferred";

const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  drive_file_id: "1N1PK",
  wizard_session_id: "8e5568a8-b3cd-4033-9840-18cba07a55c6",
  deferred_kind: "onboarding_parse_failure",
  deferred_at: "2026-07-15T05:19:14Z",
  deferred_at_modified_time: "2026-07-15T05:00:00Z",
  reason: `Parse error with token ${TOKEN}`,
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
});

describe("queryDeferred", () => {
  it("SELECT is the exact §5.0-allowlisted projection (never selects email by default)", async () => {
    await queryDeferred({});
    expect(state.selectArg).toBe(
      "id, drive_file_id, wizard_session_id, deferred_kind, deferred_at, deferred_at_modified_time, reason",
    );
    expect(state.selectArg).not.toContain("deferred_by_email");
  });
  it("selects deferred_by_email ONLY under includePii", async () => {
    await queryDeferred({ includePii: true });
    expect(state.selectArg).toContain("deferred_by_email");
  });
  it("orders deferred_at desc and applies bound", async () => {
    await queryDeferred({ limit: 7 });
    const names = state.calls.map((c) => c.method);
    const orderCall = state.calls.find((c) => c.method === "order")!;
    expect(orderCall.args).toEqual(["deferred_at", { ascending: false }]);
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([7]);
    expect(names.indexOf("order")).toBeLessThan(names.indexOf("limit"));
  });
  it("sanitizes reason (token dropped), default limit 100", async () => {
    const r = await queryDeferred({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.reason).not.toContain(TOKEN);
    expect(state.calls.find((c) => c.method === "limit")!.args).toEqual([100]);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryDeferred({})).kind).toBe("infra_error");
  });
  it("deferredByEmail field absent from output by default", async () => {
    state.rows = [{ ...baseRow, deferred_by_email: "user@example.com" }];
    const r = await queryDeferred({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect("deferredByEmail" in r.rows[0]!).toBe(false);
  });
  it("deferredByEmail present under includePii", async () => {
    state.rows = [{ ...baseRow, deferred_by_email: "user@example.com" }];
    const r = await queryDeferred({ includePii: true });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.deferredByEmail).toBe("user@example.com");
  });
});
