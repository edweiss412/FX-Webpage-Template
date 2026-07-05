// Bell notification center Task 12: POST /api/admin/alerts/bell/token.
// Mints a short-lived Realtime JWT for the admin-only `admin:alerts` private
// channel (spec §5.2/§5.3). Cloned from tests/app/api/bellCountRoute.test.ts
// (requireAdminIdentity mock shape) + tests/api/realtime/subscriber-token.test.ts
// (JWT decode assertions). Failure modes pinned:
//   (a) AdminInfraError from requireAdminIdentity → 503 (mirrors bell/count's
//       auth-infra contract);
//   (b) missing/short JWT secret or missing issuer → 500
//       SHOW_REALTIME_TOKEN_MISCONFIGURED — a DIFFERENT failure class from
//       (a), deliberately mirroring the subscriber-token route's mint-config
//       status/code rather than the 503 auth contract;
//   (c) mint success → 200 with a JWT whose claims are EXACTLY
//       { sub, exp, iat, iss, role: 'authenticated', viewer_kind: 'admin' }
//       and NO show_id claim (spec §5.3 — admin-only, unscoped to any show),
//       with exp - iat === 300;
//   (d) non-admin (forbidden()/notFound() control flow) propagates untouched.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { jwtVerify } from "jose";

const TEST_JWT_SECRET = "test-secret-32-bytes-long-pad-pad-pad-pad-pad";
const TEST_REALTIME_ISS = "supabase-realtime-test";

vi.mock("@/lib/auth/requireAdmin", () => {
  class AdminInfraError extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
    constructor(message: string) {
      super(message);
      this.name = "AdminInfraError";
    }
  }
  return {
    AdminInfraError,
    requireAdminIdentity: vi.fn(),
  };
});

import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { POST } from "@/app/api/admin/alerts/bell/token/route";

const requireAdminIdentityMock = vi.mocked(requireAdminIdentity);

describe("POST /api/admin/alerts/bell/token", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;
  const originalIss = process.env.SUPABASE_REALTIME_ISS;

  beforeEach(() => {
    requireAdminIdentityMock.mockReset();
    requireAdminIdentityMock.mockResolvedValue({ email: "admin@fxav.test" });
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    process.env.SUPABASE_REALTIME_ISS = TEST_REALTIME_ISS;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = originalSecret;
    if (originalIss === undefined) delete process.env.SUPABASE_REALTIME_ISS;
    else process.env.SUPABASE_REALTIME_ISS = originalIss;
  });

  test("requireAdminIdentity throwing AdminInfraError → 503", async () => {
    requireAdminIdentityMock.mockRejectedValue(new AdminInfraError("forced"));

    const response = await POST();

    expect(response.status).toBe(503);
  });

  test("requireAdminIdentity throwing Next control flow propagates (rejects)", async () => {
    // Stand-in for forbidden()/notFound() control-flow errors: a plain Error
    // that is NOT an AdminInfraError must escape the handler for Next to catch.
    const controlFlow = new Error("NEXT_HTTP_ERROR_FALLBACK;403");
    requireAdminIdentityMock.mockRejectedValue(controlFlow);

    await expect(POST()).rejects.toBe(controlFlow);
  });

  test("missing SUPABASE_JWT_SECRET → 500 SHOW_REALTIME_TOKEN_MISCONFIGURED", async () => {
    delete process.env.SUPABASE_JWT_SECRET;

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" });
  });

  test("missing SUPABASE_REALTIME_ISS → 500 SHOW_REALTIME_TOKEN_MISCONFIGURED", async () => {
    delete process.env.SUPABASE_REALTIME_ISS;

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" });
  });

  test("SUPABASE_JWT_SECRET shorter than 32 bytes → 500 SHOW_REALTIME_TOKEN_MISCONFIGURED", async () => {
    process.env.SUPABASE_JWT_SECRET = "too-short";

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "SHOW_REALTIME_TOKEN_MISCONFIGURED" });
  });

  test("mint success → 200 with JWT claims { sub, iss, role, viewer_kind }, no show_id, exp-iat=300", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { jwt: string; exp: number };
    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(payload.sub).toBe("admin@fxav.test");
    expect(payload.iss).toBe(TEST_REALTIME_ISS);
    expect(payload.role).toBe("authenticated");
    expect(payload.viewer_kind).toBe("admin");
    expect(payload.show_id).toBeUndefined();
    expect(typeof payload.iat).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(300);
    expect(body.exp).toBe(payload.exp);
  });
});
