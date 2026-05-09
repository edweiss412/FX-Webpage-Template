import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const adminMock = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: adminMock.requireAdmin,
}));

const discardMock = vi.hoisted(() => ({
  discardStaged: vi.fn<
    (args: unknown) => Promise<
      | { outcome: "discarded"; variant: "try_again" | "defer_until_modified" | "permanent_ignore" }
      | { outcome: "x"; code: string }
    >
  >(async () => ({ outcome: "discarded", variant: "try_again" })),
}));

vi.mock("@/lib/sync/discardStaged", () => ({
  discardStaged: discardMock.discardStaged,
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

const { POST } = await import("@/app/api/admin/staged/[fileId]/discard/route");

function request(body: unknown) {
  return new NextRequest("https://crew.fxav.test/api/admin/staged/drive-file-1/discard", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/staged/[fileId]/discard", () => {
  beforeEach(() => {
    adminMock.requireAdmin.mockClear();
    discardMock.discardStaged.mockClear();
    supabaseMock.userEmail = "Doug@FXAV.test";
    supabaseMock.getUserError = null;
    supabaseMock.getUserThrows = null;
  });

  test("wizard source_scope is a hard 501 guard before discardStaged", async () => {
    const response = await POST(
      request({ source_scope: "wizard", staged_id: "22222222-2222-4222-8222-222222222222", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED",
    });
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });

  test("live discard passes staged_id and variant", async () => {
    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        variant: "defer_until_modified",
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      result: { outcome: "discarded", variant: "try_again" },
    });
    expect(discardMock.discardStaged).toHaveBeenCalledWith({
      driveFileId: "drive-file-1",
      sourceScope: "live",
      stagedId: "11111111-1111-4111-8111-111111111111",
      discardedByEmail: "doug@fxav.test",
      variant: "defer_until_modified",
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
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });

  test("non-UUID staged_id returns INVALID_REVIEWER_ACTION before discardStaged", async () => {
    const response = await POST(
      request({ source_scope: "live", staged_id: "not-a-uuid", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "INVALID_REVIEWER_ACTION",
    });
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });

  test("invalid live discard variant is rejected instead of defaulting to try_again", async () => {
    const response = await POST(
      request({
        source_scope: "live",
        staged_id: "11111111-1111-4111-8111-111111111111",
        variant: "permanint_ignore",
      }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "INVALID_REVIEWER_ACTION",
    });
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });

  test.each([
    ["PENDING_SYNC_NOT_FOUND", 404],
    ["WIZARD_SCOPE_NOT_YET_IMPLEMENTED", 501],
    ["INVALID_REVIEWER_ACTION", 400],
    ["STALE_DISCARD_REJECTED", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    discardMock.discardStaged.mockResolvedValueOnce({ outcome: "x", code });

    const response = await POST(
      request({ source_scope: "live", staged_id: "11111111-1111-4111-8111-111111111111", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });

  test("admin email lookup infra faults return SYNC_INFRA_ERROR", async () => {
    supabaseMock.getUserThrows = new Error("network");

    const response = await POST(
      request({ source_scope: "live", staged_id: "11111111-1111-4111-8111-111111111111", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });

  test("admin email returned-error path returns SYNC_INFRA_ERROR", async () => {
    supabaseMock.getUserError = { message: "auth unreachable" };

    const response = await POST(
      request({ source_scope: "live", staged_id: "11111111-1111-4111-8111-111111111111", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "SYNC_INFRA_ERROR" });
    expect(discardMock.discardStaged).not.toHaveBeenCalled();
  });
});
