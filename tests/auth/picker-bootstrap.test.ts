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
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    rpc: async (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
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
    state.rpcCalls = [];
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

  test("claim_oauth_identity returned-error is a 502 alert with row null-scoped but context carrying show_id", async () => {
    state.google = {
      kind: "success",
      viewer: {
        kind: "crew",
        email: "crew@fxav.test",
        showId: "11111111-1111-4111-8111-111111111111",
        crewMemberId: "22222222-2222-4222-8222-222222222222",
      },
    } as unknown;
    state.claim = {
      data: null,
      error: { code: "40001", message: "serialization failure" },
      throws: false,
    };
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request());

    expect(res.status).toBe(502);
    expect(state.alerts).toHaveLength(1);
    const alert = state.alerts[0]!;
    expect(alert.code).toBe("PICKER_BOOTSTRAP_RPC_FAILED");
    expect(alert.showId).toBeNull();
    expect(alert.context).toEqual({
      attempted_email_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      rpc_error_code: "40001",
      rpc_error_message: "serialization failure",
      route: "/api/auth/picker-bootstrap",
      show_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(JSON.stringify(alert.context)).not.toContain("crew@fxav.test");
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
    // Host-relative Location: `new URL(relative)` with no base THROWS, so this
    // compares the header directly. That relativeness is the fix — an absolute
    // Location built from request.url could flip the host and drop the auth
    // cookie (lib/http/hostRelativeRedirect.ts).
    expect(res.headers.get("location")).toBe(
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

/**
 * Task 1 — a `next` carrying an allow-listed query must bootstrap, not 403.
 *
 * `lib/auth/validateNextParam.ts:77` deliberately re-attaches allow-listed `s`
 * and `gate` params, and the handler already redirects to that same
 * query-carrying string. Only `parseNextPath` rejected it, because
 * SHOW_NEXT_RE is `$`-anchored on the 64-hex token.
 *
 * Every case asserts the EXACT Location. A status-only assertion would pass
 * against a handler that stripped the query, which is precisely the behavior
 * spec §1.1 R1 rejects.
 */
describe("/api/auth/picker-bootstrap — query-bearing next (spec §2.1)", () => {
  const SHARE_TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
  const BASE = `/show/sample-show/${SHARE_TOKEN}`;

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

  test.each([
    ["bare", BASE, BASE],
    ["section deep link", `${BASE}?s=schedule`, `${BASE}?s=schedule`],
    ["gate context", `${BASE}?gate=skip`, `${BASE}?gate=skip`],
    ["both, stable order", `${BASE}?s=schedule&gate=skip`, `${BASE}?s=schedule&gate=skip`],
  ])("%s redirects to the exact next", async (_label, next, expected) => {
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request({ next }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(expected);
  });

  test("a next whose path portion is not a tokenized crew route is still rejected", async () => {
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request({ next: `${BASE}/extra` }));

    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
  });

  test("a non-allow-listed param is dropped, not forwarded", async () => {
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    const res = await GET(request({ next: `${BASE}?s=schedule&evil=1` }));

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("s=schedule");
    expect(location).not.toContain("evil");
  });

  test("resolve_show receives the PARSED slug and token, never the whole next string", async () => {
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

    await GET(request({ next: `${BASE}?s=schedule&gate=skip` }));

    // Without this, mutating the RPC call to pass `nextOutcome.path` would leave
    // every status and Location assertion green while production resolution
    // received the entire route (query included) instead of the 64-hex token,
    // and returned 403. The mock ignores its arguments, so nothing else here
    // can see that.
    const resolve = state.rpcCalls.find((c) => c.name === "resolve_show_by_slug_and_token");
    expect(resolve?.args).toEqual({ p_slug: "sample-show", p_share_token: SHARE_TOKEN });
  });

  test("an intent token signed for a different slug still 403s when next carries a query", async () => {
    const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
    const wrongToken = signIntent({
      slug: "another-show",
      shareToken: SHARE_TOKEN,
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const res = await GET(request({ next: `${BASE}?s=schedule`, token: wrongToken }));

    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
  });
});
