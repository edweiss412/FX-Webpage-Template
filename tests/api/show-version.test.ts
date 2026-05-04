/**
 * tests/api/show-version.test.ts (M4 Task 4.16 routes)
 *
 * Asserts /api/show/[slug]/version returns:
 *   - 401 when resolveShowViewer → kind: 'denied' (no/invalid creds, unknown slug)
 *   - 403 when resolveShowViewer → kind: 'forbidden' (cross-show)
 *   - 200 + { version_token } for admin / crew_link / crew_google success arms.
 *
 * resolveShowViewer is mocked so this test exercises ONLY the route's
 * status-code mapping and version_token plumbing — the 5-arm union behavior
 * is pinned by tests/auth/resolveShowViewer.test.ts.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

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
      lastSlug: null as null | string,
    },
  };
});

vi.mock("@/lib/auth/resolveShowViewer", () => ({
  resolveShowViewer: async (_req: unknown, slug: string) => {
    resolveMock.state.lastSlug = slug;
    return resolveMock.state.result;
  },
}));

const supaMock = vi.hoisted(() => {
  return {
    state: {
      versionToken: "1700000000000",
      rpcError: null as null | { message: string },
      rpcCalls: [] as Array<{ name: string; args: unknown }>,
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: async (name: string, args: unknown) => {
      supaMock.state.rpcCalls.push({ name, args });
      if (supaMock.state.rpcError) {
        return { data: null, error: supaMock.state.rpcError };
      }
      return { data: supaMock.state.versionToken, error: null };
    },
  }),
}));

const { GET } = await import("@/app/api/show/[slug]/version/route");

function fakeReq(): NextRequest {
  return new Request("http://localhost/api/show/test-show/version", {
    method: "GET",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
  resolveMock.state.lastSlug = null;
  supaMock.state.versionToken = "1700000000000";
  supaMock.state.rpcError = null;
  supaMock.state.rpcCalls = [];
});

describe("GET /api/show/[slug]/version", () => {
  test("denied → 401 SHOW_VERSION_AUTH_FAILED", async () => {
    // Pin BOTH status code and the version-route-specific error code.
    // Distinct from /api/realtime/subscriber-token's
    // SHOW_REALTIME_BROADCAST_AUTH_FAILED so admin-info logs and client
    // branching can tell which surface returned the 401 (per plan §826).
    resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_VERSION_AUTH_FAILED");
    expect(resolveMock.state.lastSlug).toBe("test-show");
  });

  test("denied (unknown_slug) → 401 SHOW_VERSION_AUTH_FAILED", async () => {
    resolveMock.state.result = { kind: "denied", reason: "unknown_slug" };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "nope" }) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_VERSION_AUTH_FAILED");
  });

  test("forbidden → 403 SHOW_VERSION_CROSS_SHOW_FORBIDDEN", async () => {
    // Pin the version-route-specific cross-show code. A regression that
    // emits SHOW_REALTIME_CROSS_SHOW_FORBIDDEN here would defeat the §826
    // distinction the plan requires (this test was the gap that let the
    // HIGH 1 review finding land).
    resolveMock.state.result = {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: "different-show-uuid",
    };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_VERSION_CROSS_SHOW_FORBIDDEN");
  });

  test("admin → 200 + version_token (calls viewer_version_token RPC)", async () => {
    resolveMock.state.result = {
      kind: "admin",
      email: "edweiss412@gmail.com",
      show_id: "show-uuid-1",
    };
    supaMock.state.versionToken = "1234567890";
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { version_token: string };
    expect(body.version_token).toBe("1234567890");
    expect(supaMock.state.rpcCalls).toHaveLength(1);
    expect(supaMock.state.rpcCalls[0]?.name).toBe("viewer_version_token");
    expect(supaMock.state.rpcCalls[0]?.args).toEqual({ p_show_id: "show-uuid-1" });
  });

  test("crew_link → 200 + version_token", async () => {
    resolveMock.state.result = {
      kind: "crew_link",
      show_id: "show-uuid-1",
      crew_member_id: "crew-1",
    };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(200);
  });

  test("crew_google → 200 + version_token", async () => {
    resolveMock.state.result = {
      kind: "crew_google",
      email: "alice@fxav.test",
      show_id: "show-uuid-1",
      crew_member_id: "crew-1",
    };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(200);
  });

  test("RPC error after auth pass → 500 (does NOT leak as 200)", async () => {
    resolveMock.state.result = {
      kind: "admin",
      email: "edweiss412@gmail.com",
      show_id: "show-uuid-1",
    };
    supaMock.state.rpcError = { message: "synthetic db error" };
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(res.status).toBe(500);
  });

  test("denied/forbidden status codes are distinct (regression fence)", async () => {
    resolveMock.state.result = { kind: "denied", reason: "no_credentials" };
    const denied = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    resolveMock.state.result = {
      kind: "forbidden",
      reason: "cross_show_link_session",
      show_id: "different-show-uuid",
    };
    const forbidden = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });
    expect(denied.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(denied.status).not.toBe(forbidden.status);
  });
});
