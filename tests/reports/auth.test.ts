import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  picker: { kind: "no_selection" } as unknown,
  pickerCalls: [] as Array<{ showId: string; cookie: string | undefined }>,
  submitReport: vi.fn(
    async (): Promise<{ status: number; body: Record<string, unknown> }> => ({
      status: 501,
      body: { ok: false, code: "NOT_IMPLEMENTED" },
    }),
  ),
  requireAdminIdentity: vi.fn(async (): Promise<{ email: string }> => {
    throw new Error("forbidden");
  }),
  roleFlags: ["A1"] as string[],
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async (input: { showId: string; cookie: string | undefined }) => {
    authMock.pickerCalls.push(input);
    return authMock.picker;
  },
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: vi.fn(() => {
    throw new Error("validateGoogleSession must not be called by report route");
  }),
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  AdminInfraError: class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  },
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

function request(body: unknown = validBody, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest("https://crew.fxav.test/api/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("POST /api/report auth skeleton", () => {
  beforeEach(() => {
    authMock.picker = { kind: "no_selection" };
    authMock.pickerCalls = [];
    authMock.requireAdminIdentity.mockReset();
    authMock.submitReport.mockReset();
    authMock.submitReport.mockResolvedValue({
      status: 501,
      body: { ok: false, code: "NOT_IMPLEMENTED" },
    });
    authMock.requireAdminIdentity.mockRejectedValue(new Error("forbidden"));
    authMock.roleFlags = ["A1"];
  });

  test("rejects malformed or non-v4 idempotency keys before auth or DB work", async () => {
    const response = await POST(request({ ...validBody, idempotency_key: "not-a-uuid" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(authMock.pickerCalls).toEqual([]);
    expect(authMock.requireAdminIdentity).not.toHaveBeenCalled();
    expect(authMock.submitReport).not.toHaveBeenCalled();
  });

  test("returns 401 when picker and admin auth both reject", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(authMock.pickerCalls).toEqual([{ showId: validBody.show_id, cookie: undefined }]);
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
  });

  test("valid picker cookie submits as crew report", async () => {
    authMock.picker = {
      kind: "resolved",
      crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
    };
    authMock.submitReport.mockResolvedValueOnce({
      status: 200,
      body: { ok: true, status: "created" },
    });

    const response = await POST(request(validBody, "__Host-fxav_picker=signed"));

    expect(response.status).toBe(200);
    expect(authMock.submitReport).toHaveBeenCalledWith(
      {
        kind: "crew",
        source: "picker",
        showId: validBody.show_id,
        crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
        roleFlags: ["A1"],
      },
      validBody,
    );
  });

  test("session_mismatch maps to 410 and does not submit", async () => {
    authMock.picker = {
      kind: "identity_invalidated",
      reason: "session_mismatch",
      expectedEpoch: 1,
      expectedCrewMemberId: "018f2f4c-0000-4000-9000-000000000002",
    };

    const response = await POST(request(validBody, "__Host-fxav_picker=signed"));

    expect(response.status).toBe(410);
    expect(authMock.submitReport).not.toHaveBeenCalled();
  });

  test("crew surface can still use admin auth when no picker session is present", async () => {
    authMock.requireAdminIdentity.mockResolvedValueOnce({ email: "admin@example.com" });
    authMock.submitReport.mockResolvedValueOnce({
      status: 200,
      body: { ok: true, status: "created", github_issue_url: "https://github.test/issue/2" },
    });

    const response = await POST(request({ ...validBody, surface: "crew" }));

    expect(response.status).toBe(200);
    expect(authMock.requireAdminIdentity).toHaveBeenCalledOnce();
    expect(authMock.submitReport).toHaveBeenCalledWith(
      { kind: "admin", email: "admin@example.com" },
      expect.objectContaining({ surface: "crew" }),
    );
  });

  test("admin surface rejects when admin auth fails instead of falling through to a picker session", async () => {
    authMock.picker = {
      kind: "resolved",
      crewMemberId: "018f2f4c-0000-4000-9000-000000000002",
    };

    const response = await POST(request({ ...validBody, surface: "admin" }));

    expect(response.status).toBe(403);
    expect(authMock.pickerCalls).toEqual([]);
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
  });
});
