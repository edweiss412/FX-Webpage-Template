import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  validateLinkSession: vi.fn(async (): Promise<unknown> => ({ kind: "continue" as const })),
  validateGoogleSession: vi.fn(async (): Promise<unknown> => ({ kind: "continue" as const })),
  requireAdmin: vi.fn(async () => {
    throw new Error("forbidden");
  }),
}));

vi.mock("@/lib/auth/validateLinkSession", () => ({
  validateLinkSession: authMock.validateLinkSession,
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: authMock.validateGoogleSession,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  },
  requireAdmin: authMock.requireAdmin,
}));

const { POST } = await import("@/app/api/report/route");

const validBody = {
  idempotency_key: "018f2f4c-8f54-4c28-9f56-f0f1b2c3d4e5",
  show_id: "018f2f4c-0000-4000-9000-000000000001",
  message: "Something looks wrong",
  surface: "crew_footer",
};

function request(body: unknown = validBody) {
  return new NextRequest("https://crew.fxav.test/api/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/report auth skeleton", () => {
  beforeEach(() => {
    authMock.validateLinkSession.mockReset();
    authMock.validateGoogleSession.mockReset();
    authMock.requireAdmin.mockReset();
    authMock.validateLinkSession.mockResolvedValue({ kind: "continue" });
    authMock.validateGoogleSession.mockResolvedValue({ kind: "continue" });
    authMock.requireAdmin.mockRejectedValue(new Error("forbidden"));
  });

  test("returns 401 when link, Google, and admin auth all reject", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(authMock.validateLinkSession).toHaveBeenCalledWith(expect.any(Request), {
      showId: validBody.show_id,
    });
    expect(authMock.validateGoogleSession).toHaveBeenCalledWith(expect.any(Request), {
      showId: validBody.show_id,
    });
    expect(authMock.requireAdmin).toHaveBeenCalledOnce();
  });

  test("continues to downstream 501 stub after link-session success", async () => {
    authMock.validateLinkSession.mockResolvedValueOnce({
      kind: "success",
      viewer: {
        kind: "crew",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "NOT_IMPLEMENTED" });
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.requireAdmin).not.toHaveBeenCalled();
  });
});
