import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  validateLinkSession: vi.fn(async (): Promise<unknown> => ({ kind: "continue" as const })),
  validateGoogleSession: vi.fn(async (): Promise<unknown> => ({ kind: "continue" as const })),
  submitReport: vi.fn(async () => ({ status: 501, body: { ok: false, code: "NOT_IMPLEMENTED" } })),
  requireAdmin: vi.fn(async () => {
    throw new Error("forbidden");
  }),
  requireAdminIdentity: vi.fn(async () => {
    throw new Error("forbidden");
  }),
  roleFlags: ["A1"] as string[],
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
  requireAdminIdentity: authMock.requireAdminIdentity,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role_flags: authMock.roleFlags },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/reports/submit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/submit")>();
  return {
    ...actual,
    submitReport: authMock.submitReport,
  };
});

const { POST } = await import("@/app/api/report/route");
const { AdminInfraError } = await import("@/lib/auth/requireAdmin");

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
    authMock.requireAdminIdentity.mockReset();
    authMock.submitReport.mockReset();
    authMock.validateLinkSession.mockResolvedValue({ kind: "continue" });
    authMock.validateGoogleSession.mockResolvedValue({ kind: "continue" });
    authMock.submitReport.mockResolvedValue({
      status: 501,
      body: { ok: false, code: "NOT_IMPLEMENTED" },
    });
    authMock.requireAdmin.mockRejectedValue(new Error("forbidden"));
    authMock.requireAdminIdentity.mockRejectedValue(new Error("forbidden"));
    authMock.roleFlags = ["A1"];
  });

  test("rejects malformed or non-v4 idempotency keys before auth or DB work", async () => {
    for (const idempotencyKey of [
      "not-a-uuid",
      "018f2f4c-8f54-1c28-9f56-f0f1b2c3d4e5",
      "018f2f4c-8f54-4c28-7f56-f0f1b2c3d4e5",
    ]) {
      const response = await POST(request({ ...validBody, idempotency_key: idempotencyKey }));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ ok: false });
    }

    expect(authMock.validateLinkSession).not.toHaveBeenCalled();
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.requireAdminIdentity).not.toHaveBeenCalled();
    expect(authMock.submitReport).not.toHaveBeenCalled();
  });

  test("rejects malformed show IDs before auth or DB work", async () => {
    const response = await POST(request({ ...validBody, show_id: "not-a-uuid" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(authMock.validateLinkSession).not.toHaveBeenCalled();
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.requireAdminIdentity).not.toHaveBeenCalled();
    expect(authMock.submitReport).not.toHaveBeenCalled();
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
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
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
    expect(authMock.requireAdminIdentity).not.toHaveBeenCalled();
  });

  test("admin surface prefers admin identity over an otherwise-valid link session and preserves crewPreview context", async () => {
    const crewPreview = {
      crewMemberId: "018f2f4c-0000-4000-9000-000000000003",
      name: "Alice Preview",
      role: "A1",
    };
    authMock.validateLinkSession.mockResolvedValueOnce({
      kind: "success",
      viewer: {
        kind: "crew",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
      },
    });
    authMock.requireAdminIdentity.mockResolvedValueOnce({ email: "admin@example.com" });
    authMock.submitReport.mockResolvedValueOnce({
      status: 200,
      body: { ok: true, status: "created", github_issue_url: "https://github.test/issue/1" },
    });

    const response = await POST(request({ ...validBody, surface: "admin", crewPreview }));

    expect(response.status).toBe(200);
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(authMock.validateLinkSession).not.toHaveBeenCalled();
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.submitReport).toHaveBeenCalledWith(
      { kind: "admin", email: "admin@example.com" },
      expect.objectContaining({ surface: "admin", crewPreview }),
    );
  });

  test("admin surface rejects when admin auth fails instead of falling through to a valid crew session", async () => {
    authMock.validateLinkSession.mockResolvedValueOnce({
      kind: "success",
      viewer: {
        kind: "crew",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
      },
    });
    authMock.requireAdminIdentity.mockRejectedValueOnce(new Error("forbidden"));

    const response = await POST(request({ ...validBody, surface: "admin" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(authMock.validateLinkSession).not.toHaveBeenCalled();
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.submitReport).not.toHaveBeenCalled();
  });

  test("admin surface preserves admin auth infra failures as cataloged 500 responses", async () => {
    authMock.requireAdminIdentity.mockRejectedValueOnce(
      new AdminInfraError("requireAdmin: getUser failed"),
    );

    const response = await POST(request({ ...validBody, surface: "admin" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(authMock.validateLinkSession).not.toHaveBeenCalled();
    expect(authMock.validateGoogleSession).not.toHaveBeenCalled();
    expect(authMock.submitReport).not.toHaveBeenCalled();
  });

  test("crew surface keeps link-session auth and does not leak crewPreview into the auth context", async () => {
    const crewPreview = {
      crewMemberId: "018f2f4c-0000-4000-9000-000000000003",
      name: "Alice Preview",
      role: "A1",
    };
    authMock.validateLinkSession.mockResolvedValueOnce({
      kind: "success",
      viewer: {
        kind: "crew",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
      },
    });
    authMock.submitReport.mockResolvedValueOnce({
      status: 200,
      body: { ok: true, status: "created" },
    });

    const response = await POST(request({ ...validBody, surface: "crew", crewPreview }));

    expect(response.status).toBe(200);
    expect(authMock.requireAdminIdentity).not.toHaveBeenCalled();
    expect(authMock.submitReport).toHaveBeenCalledWith(
      {
        kind: "crew",
        source: "link",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
        roleFlags: ["A1"],
      },
      expect.objectContaining({ surface: "crew", crewPreview }),
    );
  });

  test("crew surface can still use admin auth when no crew session is present", async () => {
    authMock.requireAdminIdentity.mockResolvedValueOnce({ email: "admin@example.com" });
    authMock.submitReport.mockResolvedValueOnce({
      status: 200,
      body: { ok: true, status: "created", github_issue_url: "https://github.test/issue/2" },
    });

    const response = await POST(request({ ...validBody, surface: "crew" }));

    expect(response.status).toBe(200);
    expect(authMock.validateLinkSession).toHaveBeenCalledOnce();
    expect(authMock.validateGoogleSession).toHaveBeenCalledOnce();
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(authMock.submitReport).toHaveBeenCalledWith(
      { kind: "admin", email: "admin@example.com" },
      expect.objectContaining({ surface: "crew" }),
    );
  });
});
