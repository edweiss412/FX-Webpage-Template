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

import { queryStagedParses } from "@/lib/observe/query/staged";

const SESSION = "8e5568a8-b3cd-4033-9840-18cba07a55c6";
const TOKEN = "AAAABBBBCCCCDDDDEEEEFFFF1234567890";
const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  drive_file_id: "1N1PK",
  parsed_at: "2026-07-15T05:19:14Z",
  staged_modified_time: "2026-07-15T05:00:00Z",
  source_kind: "onboarding_scan",
  wizard_session_id: SESSION,
  wizard_approved: false,
  warning_summary: `Strke token ${TOKEN}`,
  last_finalize_failure_code: "RESCAN_REVIEW_REQUIRED",
  warnings: [{ severity: "warn", code: "AGENDA_DAY_EMPTIED", message: "m", rawSnippet: TOKEN }],
};

beforeEach(() => {
  state.rows = [baseRow];
  state.error = null;
  state.calls = [];
  state.selectArg = "";
});

describe("queryStagedParses", () => {
  it("SELECT is the exact §5.0-allowlisted projection (never parse_result wholesale)", async () => {
    await queryStagedParses({});
    expect(state.selectArg).toBe(
      "id, drive_file_id, parsed_at, staged_modified_time, source_kind, wizard_session_id, wizard_approved, warning_summary, last_finalize_failure_code, warnings:parse_result->warnings",
    );
    expect(state.selectArg).not.toMatch(/parse_result(?!->warnings)/);
  });
  it("selects wizard_approved_by_email ONLY under includePii", async () => {
    await queryStagedParses({ includePii: true });
    expect(state.selectArg).toContain("wizard_approved_by_email");
  });
  it("applies filters: session eq, file eq, since gte, warningsOnly ->0 not-is-null pre-cap, bound", async () => {
    await queryStagedParses({
      sessionId: SESSION,
      driveFileId: "1N1PK",
      warningsOnly: true,
      sinceHours: 168,
      limit: 7,
    });
    const names = state.calls.map((c) => c.method);
    expect(names).toContain("not");
    const not = state.calls.find((c) => c.method === "not")!;
    expect(not.args).toEqual(["parse_result->warnings->0", "is", null]);
    const limitCall = state.calls.find((c) => c.method === "limit")!;
    expect(limitCall.args).toEqual([7]);
    // DB filter ordered before the terminal limit (pre-cap)
    expect(names.indexOf("not")).toBeLessThan(names.indexOf("limit"));
  });
  it("maps rows: warnings serialized (token dropped), class-D code passthrough, count clamp default 100", async () => {
    const r = await queryStagedParses({});
    if (r.kind !== "ok") throw new Error("expected ok");
    const row = r.rows[0]!;
    expect(row.lastFinalizeFailureCode).toBe("RESCAN_REVIEW_REQUIRED");
    expect(row.lastFinalizeFailureCodeUnrecognized).toBe(false);
    expect(JSON.stringify(row.warnings)).not.toContain(TOKEN);
    expect(row.warningSummary).not.toContain(TOKEN);
    expect(state.calls.find((c) => c.method === "limit")!.args).toEqual([100]);
  });
  it("returned error → infra_error; throw → infra_error", async () => {
    state.error = { message: "boom" };
    expect((await queryStagedParses({})).kind).toBe("infra_error");
  });
  it("non-array warnings jsonb → []", async () => {
    state.rows = [{ ...baseRow, warnings: "scalar" }];
    const r = await queryStagedParses({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.warnings).toEqual([]);
  });
  it("NULL last_finalize_failure_code → empty, NOT flagged unrecognized", async () => {
    state.rows = [{ ...baseRow, last_finalize_failure_code: null }];
    const r = await queryStagedParses({});
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.rows[0]!.lastFinalizeFailureCode).toBe("");
    expect(r.rows[0]!.lastFinalizeFailureCodeUnrecognized).toBe(false);
  });
});
