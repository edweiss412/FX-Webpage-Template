import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const adminMock = vi.hoisted(() => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  },
  requireAdmin: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: adminMock.AdminInfraError,
  requireAdmin: adminMock.requireAdmin,
}));

const applyMock = vi.hoisted(() => ({
  applyStaged: vi.fn<
    (args: unknown) => Promise<
      | {
          outcome: "applied";
          showId: string;
          snapshotRevisionId?: string;
          syncAuditId: string;
          derivedSideEffects: { revokeFloorForNames: string[] };
        }
      | { outcome: "x"; code: string }
    >
  >(async () => ({
    outcome: "applied",
    showId: "show-1",
    snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    syncAuditId: "audit-1",
    derivedSideEffects: { revokeFloorForNames: [] },
  })),
}));

vi.mock("@/lib/sync/applyStaged", () => ({
  applyStaged: applyMock.applyStaged,
}));

vi.mock("@/lib/sync/promoteSnapshot", () => ({
  promoteSnapshotUpload: async () => ({ outcome: "promoted", snapshotRevisionId: "snapshot-1" }),
}));

const logAdminOutcomeMock = vi.hoisted(() => vi.fn(async (_o: unknown) => {}));
vi.mock("@/lib/log/logAdminOutcome", () => ({
  logAdminOutcome: logAdminOutcomeMock,
}));

const supabaseMock = vi.hoisted(() => ({
  userEmail: "Doug@FXAV.test",
  getUserError: null as null | { message: string },
  getUserThrows: null as null | Error,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => {
        if (supabaseMock.getUserThrows) throw supabaseMock.getUserThrows;
        return {
          data: { user: { email: supabaseMock.userEmail } },
          error: supabaseMock.getUserError,
        };
      },
    },
  }),
}));

const { POST } = await import("@/app/api/admin/staged/[fileId]/apply/route");

function request(body: unknown) {
  return new NextRequest("https://crew.fxav.test/api/admin/staged/drive-file-1/apply", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/staged/[fileId]/apply", () => {
  beforeEach(() => {
    adminMock.requireAdmin.mockClear();
    applyMock.applyStaged.mockClear();
    logAdminOutcomeMock.mockClear();
    supabaseMock.userEmail = "Doug@FXAV.test";
    supabaseMock.getUserError = null;
    supabaseMock.getUserThrows = null;
  });

  test("wizard apply passes wizard_session_id and canonical admin email", async () => {
    applyMock.applyStaged.mockResolvedValueOnce({
      outcome: "wizard_applied",
      wizardSessionId: "33333333-3333-4333-8333-333333333333",
      stagedId: "22222222-2222-4222-8222-222222222222",
    } as never);

    const response = await POST(
      request({
        source_scope: "wizard",
        wizard_session_id: "33333333-3333-4333-8333-333333333333",
        staged_id: "22222222-2222-4222-8222-222222222222",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "applied",
      result: {
        outcome: "wizard_applied",
        wizardSessionId: "33333333-3333-4333-8333-333333333333",
        stagedId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(applyMock.applyStaged).toHaveBeenCalledWith({
      driveFileId: "drive-file-1",
      sourceScope: "wizard",
      wizardSessionId: "33333333-3333-4333-8333-333333333333",
      stagedId: "22222222-2222-4222-8222-222222222222",
      reviewerChoices: [],
      appliedByEmail: "doug@fxav.test",
    });
  });

  test("live apply passes canonical admin email and maps success", async () => {
    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [{ item_id: "i1", action: "apply" }],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "apply_committed_pending_promote",
      apply_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(applyMock.applyStaged).toHaveBeenCalledWith({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "11111111-1111-4111-8111-111111111111",
      reviewerChoices: [{ item_id: "i1", action: "apply" }],
      appliedByEmail: "doug@fxav.test",
    });
  });

  test("admin infra failures return ADMIN_SESSION_LOOKUP_FAILED", async () => {
    adminMock.requireAdmin.mockRejectedValueOnce(new adminMock.AdminInfraError("rpc failed"));

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("non-admin failures return ADMIN_FORBIDDEN", async () => {
    adminMock.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "ADMIN_FORBIDDEN" });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("live apply without a snapshot row returns terminal applied instead of a poll id", async () => {
    applyMock.applyStaged.mockResolvedValueOnce({
      outcome: "applied",
      showId: "show-1",
      syncAuditId: "audit-1",
      derivedSideEffects: { revokeFloorForNames: [] },
    });

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      status: "applied",
      result: {
        outcome: "applied",
        showId: "show-1",
        syncAuditId: "audit-1",
        derivedSideEffects: { revokeFloorForNames: [] },
      },
    });
  });

  test("null JSON body returns INVALID_REVIEWER_ACTION", async () => {
    const response = await POST(request(null), {
      params: Promise.resolve({ fileId: "drive-file-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "INVALID_REVIEWER_ACTION",
    });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("non-UUID staged_id returns INVALID_REVIEWER_ACTION before applyStaged", async () => {
    const response = await POST(
      request({ source_scope: "live", staged_id: "not-a-uuid", choices: [] }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "INVALID_REVIEWER_ACTION",
    });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test.each([
    ["PENDING_SYNC_NOT_FOUND", 404],
    ["WIZARD_SESSION_SUPERSEDED", 409],
    ["STAGED_PARSE_SUPERSEDED", 409],
    ["STAGED_PARSE_SOURCE_GONE", 409],
    ["STAGED_PARSE_SOURCE_OUT_OF_SCOPE", 409],
    ["STAGED_PARSE_OUTDATED", 409],
    ["MISSING_REVIEWER_CHOICE", 400],
    ["EXTRA_REVIEWER_CHOICE", 400],
    ["DUPLICATE_REVIEWER_CHOICE", 400],
    ["INVALID_REVIEWER_ACTION", 400],
    ["SYNC_INFRA_ERROR", 500],
  ] as const)("maps %s to %i", async (code, status) => {
    applyMock.applyStaged.mockResolvedValueOnce({ outcome: "x", code });

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });

  test("admin email lookup infra faults return SYNC_INFRA_ERROR", async () => {
    supabaseMock.getUserThrows = new Error("network");

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("admin email returned-error path returns SYNC_INFRA_ERROR", async () => {
    supabaseMock.getUserError = { message: "auth unreachable" };

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("live applied logs SHOW_APPLIED with canonical actor, driveFileId, showId (202 promote path)", async () => {
    // default applyStaged mock: outcome "applied", showId "show-1", with snapshotRevisionId → 202
    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(202);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith({
      code: "SHOW_APPLIED",
      source: "api.admin.staged.apply",
      actorEmail: "doug@fxav.test",
      driveFileId: "drive-file-1",
      showId: "show-1",
    });
  });

  test("live applied without a snapshot (200 path) logs SHOW_APPLIED", async () => {
    applyMock.applyStaged.mockResolvedValueOnce({
      outcome: "applied",
      showId: "show-1",
      syncAuditId: "audit-1",
      derivedSideEffects: { revokeFloorForNames: [] },
    });

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith({
      code: "SHOW_APPLIED",
      source: "api.admin.staged.apply",
      actorEmail: "doug@fxav.test",
      driveFileId: "drive-file-1",
      showId: "show-1",
    });
  });

  test("wizard_applied logs SHOW_APPLIED with wizardSessionId and no showId", async () => {
    applyMock.applyStaged.mockResolvedValueOnce({
      outcome: "wizard_applied",
      wizardSessionId: "33333333-3333-4333-8333-333333333333",
      stagedId: "22222222-2222-4222-8222-222222222222",
    } as never);

    const response = await POST(
      request({
        source_scope: "wizard",
        wizard_session_id: "33333333-3333-4333-8333-333333333333",
        staged_id: "22222222-2222-4222-8222-222222222222",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    expect(logAdminOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logAdminOutcomeMock).toHaveBeenCalledWith({
      code: "SHOW_APPLIED",
      source: "api.admin.staged.apply",
      actorEmail: "doug@fxav.test",
      driveFileId: "drive-file-1",
      wizardSessionId: "33333333-3333-4333-8333-333333333333",
    });
    const call = logAdminOutcomeMock.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("showId");
  });

  test("discarded outcome does NOT log SHOW_APPLIED", async () => {
    applyMock.applyStaged.mockResolvedValueOnce({
      outcome: "discarded",
      variant: "try_again",
    } as never);

    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        choices: [],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    expect(logAdminOutcomeMock).not.toHaveBeenCalled();
  });
});
