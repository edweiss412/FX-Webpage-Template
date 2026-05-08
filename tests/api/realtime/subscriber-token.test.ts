/**
 * tests/api/realtime/subscriber-token.test.ts (M4 Task 4.16 routes)
 *
 * Asserts /api/realtime/subscriber-token (POST):
 *   - 401 SHOW_REALTIME_BROADCAST_AUTH_FAILED on resolveShowViewer 'denied'
 *   - 403 SHOW_REALTIME_CROSS_SHOW_FORBIDDEN on 'forbidden'
 *   - 200 + { jwt, exp } on 'admin' | 'crew_link' | 'crew_google', and the
 *     JWT carries the exact claim shape required by the spec:
 *       { show_id, sub, exp, iss, role: 'authenticated', viewer_kind }
 *
 * The signed JWT is verified inline so a future regression that adds an
 * unexpected claim, or omits a required one, breaks this suite. The
 * SUPABASE_JWT_SECRET / SUPABASE_REALTIME_ISS env vars are set inline so
 * the route's signing path is exercised end-to-end.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { ShowViewerFixture } from "@/tests/_helpers/showViewerFixtures";
import {
  mockAdminViewer,
  mockCrewGoogleViewer,
  mockCrewLinkViewer,
} from "@/tests/_helpers/showViewerFixtures";

const TEST_JWT_SECRET = "test-secret-32-bytes-long-pad-pad-pad-pad-pad";
const TEST_REALTIME_ISS = "supabase-realtime-test";

process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_REALTIME_ISS = TEST_REALTIME_ISS;

const resolveMock = vi.hoisted(() => {
  return {
    state: {
      result: {
        kind: "denied",
        reason: "no_credentials",
      } as ShowViewerFixture,
    },
  };
});

vi.mock("@/lib/auth/resolveShowViewer", () => ({
  resolveShowViewer: async () => resolveMock.state.result,
}));

const { POST } = await import("@/app/api/realtime/subscriber-token/route");

function makeReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/realtime/subscriber-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
});

describe("POST /api/realtime/subscriber-token", () => {
  test("denied → 401 SHOW_REALTIME_BROADCAST_AUTH_FAILED", async () => {
    resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_REALTIME_BROADCAST_AUTH_FAILED");
  });

  test("non-admin unpublished show denial does not issue a realtime token", async () => {
    resolveMock.state.result = { kind: "denied", reason: "unknown_slug" };
    const res = await POST(makeReq({ slug: "draft-show" }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string; jwt?: string };
    expect(body.error).toBe("SHOW_REALTIME_BROADCAST_AUTH_FAILED");
    expect(body.jwt).toBeUndefined();
  });

  test("forbidden → 403 SHOW_REALTIME_CROSS_SHOW_FORBIDDEN", async () => {
    resolveMock.state.result = {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: "different-show-uuid",
    };
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_REALTIME_CROSS_SHOW_FORBIDDEN");
  });

  test("admin → 200 + { jwt, exp }; JWT verifies + claim shape exact", async () => {
    resolveMock.state.result = mockAdminViewer("show-uuid-1");
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string; exp: number };
    expect(typeof body.jwt).toBe("string");
    expect(typeof body.exp).toBe("number");

    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));

    // Exact claim shape required by the plan: { show_id, sub, exp, iss,
    // role: 'authenticated', viewer_kind }. No extra app-level claims.
    expect(payload.show_id).toBe("show-uuid-1");
    expect(payload.sub).toBe("<admin>");
    expect(typeof payload.exp).toBe("number");
    expect(payload.iss).toBe(TEST_REALTIME_ISS);
    expect(payload.role).toBe("authenticated");
    expect(payload.viewer_kind).toBe("admin");

    // exp ~5 minutes in the future, within a generous tolerance.
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThanOrEqual(now + 4 * 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 6 * 60);
    expect(body.exp).toBe(payload.exp);
  });

  test("crew_link → 200, viewer_kind=crew_link, sub=crew_member_id", async () => {
    resolveMock.state.result = mockCrewLinkViewer("show-uuid-1", "crew-99");
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string };
    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(payload.viewer_kind).toBe("crew_link");
    expect(payload.sub).toBe("crew-99");
    expect(payload.show_id).toBe("show-uuid-1");
  });

  test("crew_google → 200, viewer_kind=crew_google, sub=crew_member_id", async () => {
    resolveMock.state.result = mockCrewGoogleViewer("show-uuid-1", "crew-77");
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string };
    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(payload.viewer_kind).toBe("crew_google");
    expect(payload.sub).toBe("crew-77");
  });

  test("missing slug in body → 400", async () => {
    resolveMock.state.result = mockAdminViewer("show-uuid-1");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  test("invalid JSON body → 400", async () => {
    const req = new Request("http://localhost/api/realtime/subscriber-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("denied/forbidden status codes are distinct", async () => {
    resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
    const denied = await POST(makeReq({ slug: "test-show" }));
    resolveMock.state.result = {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: "different-show-uuid",
    };
    const forbidden = await POST(makeReq({ slug: "test-show" }));
    expect(denied.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  test("SUPABASE_JWT_SECRET shorter than 32 bytes → 500 SHOW_REALTIME_TOKEN_MISCONFIGURED (HS256 RFC 7518 §3.2)", async () => {
    // HS256 requires the HMAC key be ≥32 bytes / 256 bits. A shorter secret
    // signs successfully but verifies weakly. The route must refuse to mint
    // rather than emit a structurally-correct JWT against an under-strength
    // key. Per Task 4.16 Checkpoint A code-quality review (Important 4).
    //
    // Failure mode this test catches: a deployment with a misconfigured
    // (too-short) SUPABASE_JWT_SECRET would otherwise mint signed JWTs the
    // attacker could brute-force; this 500 fails fast and surfaces the
    // misconfiguration in logs.
    const original = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = "short-secret"; // 12 bytes
    // Use a viewer arm that would otherwise mint successfully so the 500
    // is provably from the secret-length check, not from auth.
    resolveMock.state.result = mockAdminViewer("show-uuid-1");
    // Silence the expected console.error so the test output stays clean.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(makeReq({ slug: "test-show" }));
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("SHOW_REALTIME_TOKEN_MISCONFIGURED");
      // Internal log fired (operators see the misconfiguration); the secret
      // itself MUST NOT appear in the log message.
      expect(errorSpy).toHaveBeenCalled();
      const logged = errorSpy.mock.calls.flat().join(" ");
      expect(logged).not.toContain("short-secret");
    } finally {
      errorSpy.mockRestore();
      if (original === undefined) {
        delete process.env.SUPABASE_JWT_SECRET;
      } else {
        process.env.SUPABASE_JWT_SECRET = original;
      }
    }
  });

  test("SUPABASE_JWT_SECRET exactly 32 bytes → 200 (boundary, accepted)", async () => {
    // Boundary check: a 32-byte secret is the minimum acceptable HS256 key.
    // This test pins the boundary so a future regression that uses `>` instead
    // of `>=` would fail.
    const original = process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_JWT_SECRET = "x".repeat(32); // exactly 32 bytes
    resolveMock.state.result = mockAdminViewer("show-uuid-1");
    try {
      const res = await POST(makeReq({ slug: "test-show" }));
      expect(res.status).toBe(200);
    } finally {
      if (original === undefined) {
        delete process.env.SUPABASE_JWT_SECRET;
      } else {
        process.env.SUPABASE_JWT_SECRET = original;
      }
    }
  });
});
