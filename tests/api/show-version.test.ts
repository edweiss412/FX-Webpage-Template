import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  admin: { ok: false, reason: "not_admin" } as
    | { ok: true; email: string }
    | { ok: false; reason: "not_admin" | "infra_error" },
  picker: { kind: "no_selection" } as unknown,
  showRow: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  showError: null as unknown,
  versionToken: "1700000000000",
  versionError: null as unknown,
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => state.admin,
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async () => state.picker,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (table: string) => {
      if (table !== "shows") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.showRow, error: state.showError }),
          }),
        }),
      };
    },
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      if (state.versionError) return { data: null, error: state.versionError };
      return { data: state.versionToken, error: null };
    },
  }),
}));

const { GET } = await import("@/app/api/show/[slug]/version/route");

function fakeReq(cookie?: string): NextRequest {
  const init: RequestInit = { method: "GET" };
  if (cookie) init.headers = { cookie };
  return new Request("http://localhost/api/show/test-show/version", init) as unknown as NextRequest;
}

beforeEach(() => {
  state.admin = { ok: false, reason: "not_admin" };
  state.picker = { kind: "no_selection" };
  state.showRow = { id: "11111111-1111-4111-8111-111111111111" };
  state.showError = null;
  state.versionToken = "1700000000000";
  state.versionError = null;
  state.rpcCalls = [];
});

describe("GET /api/show/[slug]/version", () => {
  test("unknown slug collapses to 401 and does not call viewer_version_token", async () => {
    state.showRow = null;

    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "nope" }) });

    expect(res.status).toBe(401);
    expect(state.rpcCalls).toEqual([]);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_VERSION_AUTH_FAILED");
  });

  test("no picker cookie returns 401 before viewer_version_token RPC", async () => {
    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(res.status).toBe(401);
    expect(state.rpcCalls).toEqual([]);
  });

  test("valid picker cookie returns version token", async () => {
    state.picker = { kind: "resolved", crewMemberId: "22222222-2222-4222-8222-222222222222" };
    state.versionToken = "1234567890:7";

    const res = await GET(fakeReq("__Host-fxav_picker=signed"), {
      params: Promise.resolve({ slug: "test-show" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version_token: string };
    expect(body.version_token).toBe("1234567890:7");
    expect(state.rpcCalls).toEqual([
      {
        name: "viewer_version_token",
        args: { p_show_id: "11111111-1111-4111-8111-111111111111" },
      },
    ]);
  });

  test("admin session returns version token without picker cookie", async () => {
    state.admin = { ok: true, email: "admin@example.com" };
    state.versionToken = "9876543210:2";

    const res = await GET(fakeReq(), { params: Promise.resolve({ slug: "test-show" }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version_token: string };
    expect(body.version_token).toBe("9876543210:2");
  });

  test("session_mismatch maps to 410 and does not call viewer_version_token", async () => {
    state.picker = {
      kind: "identity_invalidated",
      reason: "session_mismatch",
      expectedEpoch: 1,
      expectedCrewMemberId: "22222222-2222-4222-8222-222222222222",
    };

    const res = await GET(fakeReq("__Host-fxav_picker=signed"), {
      params: Promise.resolve({ slug: "test-show" }),
    });

    expect(res.status).toBe(410);
    expect(state.rpcCalls).toEqual([]);
  });

  test("version RPC error after auth pass → 500", async () => {
    state.picker = { kind: "resolved", crewMemberId: "22222222-2222-4222-8222-222222222222" };
    state.versionError = { message: "synthetic db error" };

    const res = await GET(fakeReq("__Host-fxav_picker=signed"), {
      params: Promise.resolve({ slug: "test-show" }),
    });

    expect(res.status).toBe(500);
  });
});
