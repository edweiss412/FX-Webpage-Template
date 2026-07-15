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

import { queryIngestFailures } from "@/lib/observe/query/failures";

const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  drive_file_id: "d",
  drive_file_name: "name",
  first_seen_at: "2026-07-15T05:19:14Z",
  last_attempt_at: "2026-07-15T05:19:14Z",
  attempt_count: 3,
  last_error_code: "DRIVE_FETCH_FAILED",
  last_error_message: "fetch failed",
  last_warnings: [
    { severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m", rawSnippet: "snippet" },
  ],
  wizard_session_id: null,
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
  state.throwOnFrom = false;
});

describe("queryIngestFailures", () => {
  it("SELECT exact §5.0 allowlist", async () => {
    await queryIngestFailures({});
    expect(state.selectArg).toBe(
      "id, drive_file_id, drive_file_name, first_seen_at, last_attempt_at, attempt_count, last_error_code, last_error_message, last_warnings, wizard_session_id",
    );
  });

  it("filters: --code eq matches RAW column value (filter is not an emission); since on last_attempt_at", async () => {
    await queryIngestFailures({ code: "DRIVE_FETCH_FAILED", sinceHours: 1 });
    expect(state.calls.find((c) => c.method === "eq")!.args).toEqual([
      "last_error_code",
      "DRIVE_FETCH_FAILED",
    ]);
    expect(state.calls.find((c) => c.method === "gte")!.args[0]).toBe("last_attempt_at");
  });

  it("class-D gating on last_error_code; free text sanitized; warnings serialized", async () => {
    state.rows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        drive_file_id: "d",
        drive_file_name: `name ${TOKEN}`,
        first_seen_at: "t",
        last_attempt_at: "t",
        attempt_count: 3,
        last_error_code: TOKEN, // token-shaped garbage — not a member
        last_error_message: `msg ${TOKEN}`,
        last_warnings: [
          { severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m", rawSnippet: TOKEN },
        ],
        wizard_session_id: null,
      },
    ];
    const r = await queryIngestFailures({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.lastErrorCode).toBe("");
    expect(row.lastErrorCodeUnrecognized).toBe(true);
    expect(JSON.stringify(row)).not.toContain(TOKEN);
  });

  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryIngestFailures({})).kind).toBe("infra_error");

    state.error = null;
    state.throwOnFrom = true;
    const r = await queryIngestFailures({});
    expect(r.kind).toBe("infra_error");
    expect(r.kind === "infra_error" ? r.message : "").toBe("pending_ingestions read threw");
  });

  it("non-array last_warnings jsonb → []", async () => {
    state.rows = [{ ...baseRow, last_warnings: "scalar" }];
    const r = await queryIngestFailures({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.lastWarnings).toEqual([]);
  });

  it("limit clamped to 100 default", async () => {
    await queryIngestFailures({});
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([100]);
  });

  it("filters: sessionId eq", async () => {
    const SESSION = "8e5568a8-b3cd-4033-9840-18cba07a55c6";
    await queryIngestFailures({ sessionId: SESSION });
    expect(
      state.calls.find((c) => c.method === "eq" && c.args[0] === "wizard_session_id")!.args,
    ).toEqual(["wizard_session_id", SESSION]);
  });

  it("sinceHours default 24 when undefined", async () => {
    await queryIngestFailures({});
    const gteCall = state.calls.find((c) => c.method === "gte")!;
    const since = new Date(gteCall.args[1] as string).getTime();
    const now = Date.now();
    const diffHours = (now - since) / 3_600_000;
    expect(diffHours).toBeGreaterThanOrEqual(23.9);
    expect(diffHours).toBeLessThanOrEqual(24.1);
  });

  it("sinceHours null skips the filter", async () => {
    await queryIngestFailures({ sinceHours: null });
    const gteCall = state.calls.find((c) => c.method === "gte");
    expect(gteCall).toBeUndefined();
  });

  it("maps rows: camelCase field names", async () => {
    const r = await queryIngestFailures({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row).toHaveProperty("driveFileId");
    expect(row).toHaveProperty("driveFileName");
    expect(row).toHaveProperty("firstSeenAt");
    expect(row).toHaveProperty("lastAttemptAt");
    expect(row).toHaveProperty("attemptCount");
    expect(row).toHaveProperty("lastErrorCode");
    expect(row).toHaveProperty("lastErrorCodeUnrecognized");
    expect(row).toHaveProperty("lastErrorMessage");
    expect(row).toHaveProperty("lastWarnings");
    expect(row).toHaveProperty("wizardSessionId");
  });
});
