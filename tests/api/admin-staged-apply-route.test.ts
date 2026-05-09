import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const adminMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: adminMock.requireAdmin,
}));

const applyMock = vi.hoisted(() => ({
  applyStaged: vi.fn<
    (args: unknown) => Promise<
      | {
          outcome: "applied";
          showId: string;
          syncAuditId: string;
          derivedSideEffects: { revokeFloorForNames: string[] };
        }
      | { outcome: "x"; code: string }
    >
  >(async () => ({
      outcome: "applied",
      showId: "show-1",
      syncAuditId: "audit-1",
      derivedSideEffects: { revokeFloorForNames: [] },
    })),
}));

vi.mock("@/lib/sync/applyStaged", () => ({
  applyStaged: applyMock.applyStaged,
  WIZARD_SCOPE_NOT_YET_IMPLEMENTED: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED",
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
    supabaseMock.userEmail = "Doug@FXAV.test";
    supabaseMock.getUserError = null;
    supabaseMock.getUserThrows = null;
  });

  test("wizard source_scope is a hard 501 guard before applyStaged", async () => {
    const response = await POST(
      request({ source_scope: "wizard", staged_id: "staged-wizard", choices: [] }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED",
    });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });

  test("live apply passes canonical admin email and maps success", async () => {
    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "staged-live",
        choices: [{ item_id: "i1", action: "apply" }],
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: {
        outcome: "applied",
        showId: "show-1",
        syncAuditId: "audit-1",
        derivedSideEffects: { revokeFloorForNames: [] },
      },
    });
    expect(applyMock.applyStaged).toHaveBeenCalledWith({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "staged-live",
      reviewerChoices: [{ item_id: "i1", action: "apply" }],
      appliedByEmail: "doug@fxav.test",
    });
  });

  test.each([
    ["PENDING_SYNC_NOT_FOUND", 404],
    ["STAGED_PARSE_SUPERSEDED", 409],
    ["STAGED_PARSE_SOURCE_GONE", 409],
    ["STAGED_PARSE_SOURCE_OUT_OF_SCOPE", 409],
    ["STAGED_PARSE_OUTDATED", 409],
    ["MISSING_REVIEWER_CHOICE", 400],
    ["INVALID_REVIEWER_ACTION", 400],
  ] as const)("maps %s to %i", async (code, status) => {
    applyMock.applyStaged.mockResolvedValueOnce({ outcome: "x", code });

    const response = await POST(
      request({ source_scope: "live", staged_id: "staged-live", choices: [] }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });

  test("admin email lookup infra faults return SYNC_INFRA_ERROR", async () => {
    supabaseMock.getUserThrows = new Error("network");

    const response = await POST(
      request({ source_scope: "live", staged_id: "staged-live", choices: [] }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
    expect(applyMock.applyStaged).not.toHaveBeenCalled();
  });
});
