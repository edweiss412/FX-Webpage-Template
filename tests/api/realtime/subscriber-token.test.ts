import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

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

  test("valid picker cookie mints crew realtime JWT without legacy crew claims", async () => {
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
    expect(payload.viewer_kind).toBe("crew");
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

// P1 dark-path telemetry — credential-mint DENIALS were previously unlogged, and the two
// non-lookup infra_error 500s (picker + admin) were silent. Pin the durable forensic emits:
// each denial → ONE REALTIME_TOKEN_DENIED warn (showId + reason); each infra_error →
// REALTIME_TOKEN_INFRA_ERROR error + 500; mint-success → NO denial/infra emit.
describe("POST /api/realtime/subscriber-token — dark-path telemetry", () => {
  function capture(): LogRecord[] {
    const sink: LogRecord[] = [];
    setLogSink((r) => {
      sink.push(r);
    });
    return sink;
  }
  afterEach(() => resetLogSink());

  beforeEach(() => {
    state.admin = { ok: false, reason: "not_admin" };
    state.picker = { kind: "no_selection" };
    state.showRow = { id: "11111111-1111-4111-8111-111111111111" };
    state.showError = null;
    state.pickerCalls = [];
  });

  test("unknown slug → REALTIME_TOKEN_DENIED warn (reason unknown_slug, slug carried)", async () => {
    const sink = capture();
    state.showRow = null;

    const res = await POST(makeReq({ slug: "ghost-show" }));

    expect(res.status).toBe(401);
    const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_DENIED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.source).toBe("api.realtime.subscriberToken");
    // unknown_slug has no showId → showId null, slug carried instead.
    expect(rec[0]!.showId).toBeNull();
    expect(rec[0]!.context).toMatchObject({ reason: "unknown_slug", slug: "ghost-show" });
  });

  test("show_unavailable (410) → denial warn + body byte-preserved (no leaked reason key)", async () => {
    const sink = capture();
    state.picker = { kind: "show_unavailable" };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(410);
    // Invariant 9: the original 410 body was `{error}` ONLY — adding a telemetry `reason`
    // to this branch must NOT leak a client-visible `reason` key into the response.
    expect(await res.json()).toEqual({ error: "PICKER_SHOW_UNAVAILABLE" });
    const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_DENIED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.showId).toBe("11111111-1111-4111-8111-111111111111");
    // The denial log derives its reason from viewer.error (no body-leaking `reason` field).
    expect(rec[0]!.context).toMatchObject({ reason: "PICKER_SHOW_UNAVAILABLE" });
  });

  test("identity_invalidated (410) → denial warn + body byte-preserved (reason from picker only)", async () => {
    const sink = capture();
    state.picker = { kind: "identity_invalidated", reason: "session_mismatch" };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(410);
    // Body must equal the ORIGINAL shape: reason comes ONLY from picker.reason (no `??`
    // fallback that would inject a `reason` key when picker.reason is undefined).
    expect(await res.json()).toEqual({
      error: "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
      reason: "session_mismatch",
    });
    const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_DENIED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.showId).toBe("11111111-1111-4111-8111-111111111111");
  });

  test.each(["no_selection", "epoch_stale", "removed_from_roster"] as const)(
    "%s (401) → REALTIME_TOKEN_DENIED warn with reason",
    async (kind) => {
      const sink = capture();
      state.picker = { kind };

      const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

      expect(res.status).toBe(401);
      const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_DENIED");
      expect(rec).toHaveLength(1);
      expect(rec[0]!.level).toBe("warn");
      expect(rec[0]!.context).toMatchObject({ reason: kind });
    },
  );

  test("picker infra_error → REALTIME_TOKEN_INFRA_ERROR error + 500 (NOT a denial)", async () => {
    const sink = capture();
    state.picker = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" };

    const res = await POST(makeReq({ slug: "test-show" }, "__Host-fxav_picker=signed"));

    expect(res.status).toBe(500);
    const infra = sink.filter((r) => r.code === "REALTIME_TOKEN_INFRA_ERROR");
    expect(infra).toHaveLength(1);
    expect(infra[0]!.level).toBe("error");
    // The infra 500 must NOT masquerade as a denial.
    expect(sink.some((r) => r.code === "REALTIME_TOKEN_DENIED")).toBe(false);
  });

  test("admin infra_error → REALTIME_TOKEN_INFRA_ERROR error + 500 (NOT a denial)", async () => {
    const sink = capture();
    state.admin = { ok: false, reason: "infra_error" };

    const res = await POST(makeReq({ slug: "test-show" }));

    expect(res.status).toBe(500);
    const infra = sink.filter((r) => r.code === "REALTIME_TOKEN_INFRA_ERROR");
    expect(infra).toHaveLength(1);
    expect(infra[0]!.level).toBe("error");
    expect(sink.some((r) => r.code === "REALTIME_TOKEN_DENIED")).toBe(false);
  });

  test("mint success (admin) → NO denial/infra emit", async () => {
    const sink = capture();
    state.admin = { ok: true, email: "admin@example.com" };

    const res = await POST(makeReq({ slug: "test-show" }));

    expect(res.status).toBe(200);
    expect(sink.some((r) => r.code === "REALTIME_TOKEN_DENIED")).toBe(false);
    expect(sink.some((r) => r.code === "REALTIME_TOKEN_INFRA_ERROR")).toBe(false);
  });

  test("denial inside the request-context wrapper carries the derived requestId", async () => {
    const sink = capture();
    state.showRow = null; // unknown_slug denial
    const req = new Request("http://localhost/api/realtime/subscriber-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-vercel-id": "vercel-req-99" },
      body: JSON.stringify({ slug: "ghost-show" }),
    }) as unknown as NextRequest;

    const res = await POST(req);

    expect(res.status).toBe(401);
    const rec = sink.filter((r) => r.code === "REALTIME_TOKEN_DENIED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.requestId).toBe("vercel-req-99");
  });
});
