import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const TEST_JWT_SECRET = "test-secret-32-bytes-long-pad-pad-pad-pad-pad";
const TEST_REALTIME_ISS = "supabase-realtime-test";

process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_REALTIME_ISS = TEST_REALTIME_ISS;

const state = vi.hoisted(() => ({
  admin: { ok: false, reason: "not_admin" } as
    | { ok: true; email: string }
    | { ok: false; reason: "not_admin" | "infra_error" },
  picker: { kind: "no_selection" } as unknown,
  showRow: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  showError: null as unknown,
  pickerCalls: [] as Array<{ showId: string; cookie: string | undefined }>,
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => state.admin,
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async (input: { showId: string; cookie: string | undefined }) => {
    state.pickerCalls.push(input);
    return state.picker;
  },
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
  }),
}));

const { POST } = await import("@/app/api/realtime/subscriber-token/route");

function makeReq(body: unknown, cookie?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/realtime/subscriber-token", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  state.admin = { ok: false, reason: "not_admin" };
  state.picker = { kind: "no_selection" };
  state.showRow = { id: "11111111-1111-4111-8111-111111111111" };
  state.showError = null;
  state.pickerCalls = [];
});

describe("POST /api/realtime/subscriber-token", () => {
  test("unknown slug collapses to 401 before picker resolution", async () => {
    state.showRow = null;

    const res = await POST(makeReq({ slug: "unknown-show" }));

    expect(res.status).toBe(401);
    expect(state.pickerCalls).toEqual([]);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("SHOW_REALTIME_BROADCAST_AUTH_FAILED");
  });

  test("valid picker cookie mints crew realtime JWT without legacy crew_link/crew_google claims", async () => {
    state.picker = { kind: "resolved", crewMemberId: "22222222-2222-4222-8222-222222222222" };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(200);
    expect(state.pickerCalls).toEqual([
      {
        showId: "11111111-1111-4111-8111-111111111111",
        cookie: "signed",
      },
    ]);
    const body = (await res.json()) as { jwt: string; exp: number };
    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(payload.show_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload.sub).toBe("22222222-2222-4222-8222-222222222222");
    expect(payload.viewer_kind).toBe("crew");
    expect(JSON.stringify(payload)).not.toContain("crew_link");
    expect(JSON.stringify(payload)).not.toContain("crew_google");
  });

  test("admin session mints admin realtime JWT without requiring picker cookie", async () => {
    state.admin = { ok: true, email: "admin@example.com" };

    const res = await POST(makeReq({ slug: "test-show" }));

    expect(res.status).toBe(200);
    expect(state.pickerCalls).toEqual([]);
    const body = (await res.json()) as { jwt: string };
    const { payload } = await jwtVerify(body.jwt, new TextEncoder().encode(TEST_JWT_SECRET));
    expect(payload.sub).toBe("<admin>");
    expect(payload.viewer_kind).toBe("admin");
  });

  test("session_mismatch maps to 410 stale credential response", async () => {
    state.picker = {
      kind: "identity_invalidated",
      reason: "session_mismatch",
      expectedEpoch: 1,
      expectedCrewMemberId: "22222222-2222-4222-8222-222222222222",
    };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER");
  });

  test("resolver infra_error maps to 500", async () => {
    state.picker = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(500);
  });

  test("missing slug in body → 400", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });
});
