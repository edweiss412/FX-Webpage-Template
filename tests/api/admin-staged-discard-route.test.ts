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
  });

  test("wizard source_scope is a hard 501 guard before discardStaged", async () => {
    const response = await POST(
      request({ source_scope: "wizard", staged_id: "staged-wizard", variant: "try_again" }),
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
        staged_id: "staged-live",
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
      stagedId: "staged-live",
      variant: "defer_until_modified",
    });
  });

  test.each([
    ["PENDING_SYNC_NOT_FOUND", 404],
    ["STALE_DISCARD_REJECTED", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    discardMock.discardStaged.mockResolvedValueOnce({ outcome: "x", code });

    const response = await POST(
      request({ source_scope: "live", staged_id: "staged-live", variant: "try_again" }),
      { params: Promise.resolve({ fileId: "drive-file-1" }) },
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: code });
  });
});
