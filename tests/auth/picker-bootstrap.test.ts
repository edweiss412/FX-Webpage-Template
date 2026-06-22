import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { decodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";

const SIGNING_KEY = "a".repeat(64);
process.env.PICKER_COOKIE_SIGNING_KEY = SIGNING_KEY;

const state = vi.hoisted(() => ({
  resolveShow: {
    data: "11111111-1111-4111-8111-111111111111" as string | null,
    error: null as null | { code?: string; message?: string },
    throws: false,
  },
  google: { kind: "continue" } as unknown,
  claim: {
    data: null as unknown,
    error: null as null | { code?: string; message?: string },
    throws: false,
  },
  alerts: [] as Array<{ showId: string | null; code: string; context: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: async (name: string) => {
      if (name === "resolve_show_by_slug_and_token") {
        if (state.resolveShow.throws) throw new Error("resolve exploded");
        return { data: state.resolveShow.data, error: state.resolveShow.error };
      }
      if (name === "claim_oauth_identity") {
        if (state.claim.throws) throw new Error("claim exploded");
        return { data: state.claim.data, error: state.claim.error };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  }),
}));

vi.mock("@/lib/auth/validateGoogleSession", () => ({
  validateGoogleSession: async () => state.google,
}));

vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: async (input: {
    showId: string | null;
    code: string;
    context: Record<string, unknown>;
  }) => {
    state.alerts.push(input);
    return "alert-id";
  },
}));

function b64(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signIntent(payload: { slug: string; shareToken: string; exp: number }): string {
  const body = b64(JSON.stringify(payload));
  const sig = createHmac("sha256", Buffer.from(SIGNING_KEY, "hex"))
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function request(input: { token?: string; next?: string; cookie?: string } = {}) {
  const shareToken = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
  const next = input.next ?? `/show/sample-show/${shareToken}`;
  const token =
    input.token ??
    signIntent({ slug: "sample-show", shareToken, exp: Math.floor(Date.now() / 1000) + 60 });
  const url = new URL("http://localhost/api/auth/picker-bootstrap");
  url.searchParams.set("next", next);
  url.searchParams.set("t", token);
  const init: RequestInit = {};
  if (input.cookie) init.headers = { cookie: input.cookie };
  return new Request(url, init);
}

describe("/api/auth/picker-bootstrap", () => {
  beforeEach(() => {
    state.resolveShow = {
      data: "11111111-1111-4111-8111-111111111111",
      error: null,
      throws: false,
    };
    state.google = { kind: "continue" };
    state.claim = { data: null, error: null, throws: false };
    state.alerts = [];
  });

  test("resolve_show returned-error is a pre-session 502 alert without share token or email", async () => {
    state.resolveShow.error = { code: "42P01", message: "missing function" };
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request());

    expect(res.status).toBe(502);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(state.alerts).toEqual([
      {
        showId: null,
        code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
        context: {
          stage: "resolve_show",
          slug: "sample-show",
          rpc_error_code: "42P01",
          rpc_error_message: "missing function",
          route: "/api/auth/picker-bootstrap",
        },
      },
    ]);
    expect(JSON.stringify(state.alerts[0]?.context)).not.toContain("a1b2c3");
    expect(JSON.stringify(state.alerts[0]?.context)).not.toContain("email");
  });

  test("resolve_show data null is 403 with no admin alert", async () => {
    state.resolveShow.data = null;
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request());

    expect(res.status).toBe(403);
    expect(state.alerts).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("valid Google match mints one show using mint_safe_t_millis exactly", async () => {
    state.google = {
      kind: "success",
      viewer: {
        email: "alice@example.com",
        showId: "11111111-1111-4111-8111-111111111111",
        crewMemberId: "22222222-2222-4222-8222-222222222222",
      },
    } as unknown;
    state.claim.data = {
      claimed_count: 0,
      claimed_rows: [],
      mint_safe_t_millis: 1_737_028_800_123,
      shows: [
        {
          show_id: "11111111-1111-4111-8111-111111111111",
          crew_member_id: "22222222-2222-4222-8222-222222222222",
          picker_epoch: 7,
        },
        {
          show_id: "33333333-3333-4333-8333-333333333333",
          crew_member_id: "44444444-4444-4444-8444-444444444444",
          picker_epoch: 2,
        },
      ],
    };
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request());

    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/show/sample-show/a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345",
    );
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-fxav_picker=");
    const rawCookie = /__Host-fxav_picker=([^;]+)/.exec(setCookie)?.[1];
    const env = decodePickerCookie(rawCookie, SIGNING_KEY);
    expect(env?.selections).toEqual({
      "11111111-1111-4111-8111-111111111111": {
        id: "22222222-2222-4222-8222-222222222222",
        e: 7,
        t: 1_737_028_800_123,
      },
    });
  });
});
