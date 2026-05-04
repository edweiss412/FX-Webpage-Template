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

const TEST_JWT_SECRET = "test-secret-32-bytes-long-pad-pad-pad-pad-pad";
const TEST_REALTIME_ISS = "supabase-realtime-test";

process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_REALTIME_ISS = TEST_REALTIME_ISS;

const resolveMock = vi.hoisted(() => {
  return {
    state: {
      result: { kind: "denied", reason: "no_credentials" } as
        | { kind: "admin"; email: string; show_id: string }
        | { kind: "crew_link"; show_id: string; crew_member_id: string }
        | {
            kind: "crew_google";
            email: string;
            show_id: string;
            crew_member_id: string;
          }
        | { kind: "denied"; reason: string }
        | {
            kind: "forbidden";
            reason: string;
            show_id: string;
            email?: string;
          },
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
    resolveMock.state.result = {
      kind: "admin",
      email: "edweiss412@gmail.com",
      show_id: "show-uuid-1",
    };
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string; exp: number };
    expect(typeof body.jwt).toBe("string");
    expect(typeof body.exp).toBe("number");

    const { payload } = await jwtVerify(
      body.jwt,
      new TextEncoder().encode(TEST_JWT_SECRET),
    );

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
    resolveMock.state.result = {
      kind: "crew_link",
      show_id: "show-uuid-1",
      crew_member_id: "crew-99",
    };
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string };
    const { payload } = await jwtVerify(
      body.jwt,
      new TextEncoder().encode(TEST_JWT_SECRET),
    );
    expect(payload.viewer_kind).toBe("crew_link");
    expect(payload.sub).toBe("crew-99");
    expect(payload.show_id).toBe("show-uuid-1");
  });

  test("crew_google → 200, viewer_kind=crew_google, sub=crew_member_id", async () => {
    resolveMock.state.result = {
      kind: "crew_google",
      email: "alice@fxav.test",
      show_id: "show-uuid-1",
      crew_member_id: "crew-77",
    };
    const res = await POST(makeReq({ slug: "test-show" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jwt: string };
    const { payload } = await jwtVerify(
      body.jwt,
      new TextEncoder().encode(TEST_JWT_SECRET),
    );
    expect(payload.viewer_kind).toBe("crew_google");
    expect(payload.sub).toBe("crew-77");
  });

  test("missing slug in body → 400", async () => {
    resolveMock.state.result = {
      kind: "admin",
      email: "edweiss412@gmail.com",
      show_id: "show-uuid-1",
    };
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
});
