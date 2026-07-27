import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as { message: string } | null,
  stateRows: [] as unknown[],
  stateError: null as { message: string } | null,
  stateThrows: false,
  calls: [] as Array<{ method: string; args: unknown[] }>,
  selectArg: "",
  stateSelectArg: "",
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
    // Table-keyed builder: the module now issues TWO reads (channels + the
    // reconcile-state table, backoff spec §3.6 D10).
    const makeBuilder = (table: string) => {
      const builder: Record<string, unknown> = {};
      const chain =
        (method: string) =>
        (...args: unknown[]) => {
          state.calls.push({ method: `${table}.${method}`, args });
          if (method === "select") {
            if (table === "drive_watch_reconcile_state") state.stateSelectArg = args[0] as string;
            else state.selectArg = args[0] as string;
          }
          return builder;
        };
      for (const m of ["select", "order"]) builder[m] = chain(m);
      builder.limit = (...args: unknown[]) => {
        state.calls.push({ method: `${table}.limit`, args });
        if (table === "drive_watch_reconcile_state") {
          if (state.stateThrows) return Promise.reject(new Error("state boom"));
          return Promise.resolve({ data: state.stateRows, error: state.stateError });
        }
        return Promise.resolve({ data: state.rows, error: state.error });
      };
      return builder;
    };
    return {
      from: (table: string) => {
        state.calls.push({ method: "from", args: [table] });
        return makeBuilder(table);
      },
    };
  },
}));

import { queryWatchChannels } from "@/lib/observe/query/watch";

const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  watched_folder_id: "1abc2def3ghi4jkl5mno6pqr7stu8vwx",
  expires_at: "2026-08-15T00:00:00Z",
  created_at: "2026-07-15T05:19:14Z",
  activated_at: "2026-07-15T05:20:00Z",
  superseded_at: null,
  stopped_at: null,
};

const baseStateRow = {
  watched_folder_id: "1abc2def3ghi4jkl5mno6pqr7stu8vwx",
  consecutive_failures: 3,
  next_attempt_at: "2026-07-27T12:15:00Z",
  last_attempt_at: "2026-07-27T12:00:00Z",
  last_attempt_outcome: "failed",
  last_error_class: "drive_api",
  last_error_message: "channel create failed for admin@example.com",
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.stateRows = [baseStateRow];
  state.stateError = null;
  state.stateThrows = false;
  state.calls = [];
  state.selectArg = "";
  state.stateSelectArg = "";
  state.throwOnFrom = false;
});

describe("queryWatchChannels", () => {
  it("STRUCTURAL PIN: module source never references webhook_secret, resource_id, and never selects *", () => {
    const src = readFileSync(join(process.cwd(), "lib/observe/query/watch.ts"), "utf8");
    expect(src).not.toContain("webhook_secret");
    expect(src).not.toContain("resource_id");
    expect(src).not.toMatch(/select\(\s*["'`]\s*\*\s*["'`]/);
  });
  it("SELECT is the exact §5.0-allowlisted projection", async () => {
    await queryWatchChannels({});
    expect(state.selectArg).toBe(
      "id, status, watched_folder_id, expires_at, created_at, activated_at, superseded_at, stopped_at",
    );
    expect(state.selectArg).not.toContain("resource_id");
  });
  it("orders created_at desc and applies bound", async () => {
    await queryWatchChannels({ limit: 7 });
    const names = state.calls.map((c) => c.method);
    const orderCall = state.calls.find((c) => c.method === "drive_watch_channels.order")!;
    expect(orderCall.args).toEqual(["created_at", { ascending: false }]);
    const limitCall = state.calls.find((c) => c.method === "drive_watch_channels.limit")!;
    expect(limitCall.args).toEqual([7]);
    expect(names.indexOf("drive_watch_channels.order")).toBeLessThan(
      names.indexOf("drive_watch_channels.limit"),
    );
  });
  it("default limit 100", async () => {
    const r = await queryWatchChannels({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(state.calls.find((c) => c.method === "drive_watch_channels.limit")!.args).toEqual([100]);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryWatchChannels({})).kind).toBe("infra_error");

    state.error = null;
    state.throwOnFrom = true;
    const r = await queryWatchChannels({});
    expect(r.kind).toBe("infra_error");
    expect(r.kind === "infra_error" ? r.message : "").toBe("drive_watch_channels read threw");
  });
  it("maps rows correctly with camelCase field names", async () => {
    const r = await queryWatchChannels({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(row.status).toBe("active");
    expect(row.watchedFolderId).toBe("1abc2def3ghi4jkl5mno6pqr7stu8vwx");
    expect(row).not.toHaveProperty("resourceId");
    expect(row.expiresAt).toBe("2026-08-15T00:00:00Z");
    expect(row.createdAt).toBe("2026-07-15T05:19:14Z");
    expect(row.activatedAt).toBe("2026-07-15T05:20:00Z");
    expect(row.supersededAt).toBe(null);
    expect(row.stoppedAt).toBe(null);
  });

  // Backoff spec §3.6 D10 / §6 class 13: the reconcile-state columns ride along.
  it("returns the reconcile-state rows with sanitized last_error_message", async () => {
    const r = await queryWatchChannels({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const s = r.stateRows[0]!;
    expect(s.watchedFolderId).toBe("1abc2def3ghi4jkl5mno6pqr7stu8vwx");
    expect(s.consecutiveFailures).toBe(3);
    expect(s.nextAttemptAt).toBe("2026-07-27T12:15:00Z");
    expect(s.lastAttemptOutcome).toBe("failed");
    expect(s.lastErrorClass).toBe("drive_api");
    // sanitizeIdentityString treatment (lib/observe/query/failures.ts:61):
    // the embedded email must not survive verbatim.
    expect(s.lastErrorMessage ?? "").not.toContain("admin@example.com");
  });
  it("state SELECT never touches the channels secret columns", async () => {
    await queryWatchChannels({});
    expect(state.stateSelectArg).toContain("watched_folder_id");
    expect(state.stateSelectArg).not.toContain("webhook_secret");
  });
  it("state read returned-error and thrown paths → module's typed infra_error", async () => {
    state.stateError = { message: "boom" };
    expect((await queryWatchChannels({})).kind).toBe("infra_error");
    state.stateError = null;
    state.stateThrows = true;
    expect((await queryWatchChannels({})).kind).toBe("infra_error");
  });
});
