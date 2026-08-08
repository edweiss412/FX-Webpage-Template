import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LogRecord } from "@/lib/log/types";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * tests/auth/oauthRedirectInvalidTelemetry.test.ts
 *
 * Cluster E — durable `code:` emits for the five emit-less
 * OAUTH_REDIRECT_INVALID branches across three GET routes.
 * Spec: docs/superpowers/specs/2026-08-07-ops-log-code-emits.md
 *
 * Every case drives the REAL handler with a captured sink (never a spy on
 * log.warn), so a test cannot pass against an emit that is built but never
 * reaches the sink. Each case asserts BOTH the emit (AC-1) and its site's
 * full unchanged-refusal surface (AC-2) — an emit that disturbs the refusal
 * fails here rather than in review.
 */

const state = vi.hoisted(() => ({
  serverClient: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
  serviceRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => state.serverClient),
  createSupabaseServiceRoleClient: () => ({ rpc: state.serviceRpc }),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: async () => "alert-id",
}));
vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => ({ ok: true }),
}));

const ORIGIN = "https://crew.fxav.test";
// Cross-origin: validateNextParamDetailed rejects it (lib/auth/validateNextParam.ts:61),
// and it is non-null so the `rawNext !== null` guard at sites 1-2 is satisfied.
const REJECTED_NEXT = "https://evil.example/steal";
// signInRedirect builds `/auth/sign-in?code=<code>&next=<nextOutcome.path>` and
// nextOutcome.path is DEFAULT_AUTH_NEXT_PATH ("/admin") on every rejection.
const SIGN_IN_LOCATION = "/auth/sign-in?code=OAUTH_REDIRECT_INVALID&next=%2Fadmin";

const PKCE_COOKIE = "sb-fxavtest-auth-token-code-verifier";
const PKCE_COOKIE_RE = /^sb-[^-]+-auth-token-code-verifier(?:\.\d+)?$/;
const CLEARED_PKCE_COOKIE = `${PKCE_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

const REDIRECT_MESSAGE = "next param rejected; redirecting with OAUTH_REDIRECT_INVALID";

/**
 * The whole-record accept-set (AC-4), scoped to exactly the nine fields
 * `persistAppEvent` writes (lib/log/persist.ts:16). Anything narrower leaves a
 * channel: a denylist was defeated by a message relocation, and a context-only
 * accept-set by a fragment in `source`, which buildRecord promotes out of
 * context onto the record and which persists as its own column.
 */
function expectedRedirectInvalidRecord(input: {
  source: string;
  message: string;
  reason: string;
  requestId: string | null;
}): Record<string, unknown> {
  return {
    level: "warn",
    source: input.source,
    message: input.message,
    code: "OAUTH_REDIRECT_INVALID",
    requestId: input.requestId,
    showId: null,
    driveFileId: null,
    actorHash: null,
    context: { reason: input.reason },
  };
}

/**
 * Cardinality is HALF the assertion, not decoration on it: a `toEqual` against a
 * SELECTED record says nothing about how many were emitted, so a duplicate emit
 * on any branch would satisfy it while AC-1 says "exactly one record".
 */
function expectExactlyOneRedirectInvalidRecord(
  sink: LogRecord[],
  expected: Record<string, unknown>,
): void {
  const matched = sink.filter((r) => r.code === "OAUTH_REDIRECT_INVALID");
  expect(matched).toHaveLength(1);
  expect(matched[0]!).toEqual(expected);
}

async function withCapture<T>(run: (sink: LogRecord[]) => Promise<T>): Promise<T> {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  try {
    return await run(sink);
  } finally {
    log.resetLogSink();
  }
}

describe("OAUTH_REDIRECT_INVALID durable telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_ORIGIN = ORIGIN;
    state.serverClient.auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    state.serverClient.auth.getUser.mockResolvedValue({
      data: { user: { email: "crew@fxav.test" } },
      error: null,
    });
    state.serverClient.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.test/o/oauth2/auth" },
      error: null,
    });
    state.serviceRpc.mockResolvedValue({ data: { claimed_rows: [] }, error: null });
  });
  afterEach(() => vi.clearAllMocks());

  test("site 1 — callback, invalid EXPLICIT next → callback_invalid_explicit_next", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/auth/callback/route");
      const request = new NextRequest(
        `${ORIGIN}/auth/callback?code=abc&next=${encodeURIComponent(REJECTED_NEXT)}`,
        { headers: { cookie: `${PKCE_COOKIE}=verifier-value` } },
      );

      // PREMISE: clearPkceVerifierCookies iterates the REQUEST's cookies and
      // appends nothing when none match, so a request carrying no code-verifier
      // cookie would assert over an empty set and pass even if the call were
      // deleted outright.
      premiseHolds(
        "the request carries a PKCE code-verifier cookie, so the Set-Cookie assertion below can observe clearPkceVerifierCookies",
        request.cookies.getAll().some((c) => PKCE_COOKIE_RE.test(c.name)),
      );

      const res = await GET(request);

      // Unchanged refusal (AC-2), asserted BEFORE the sink so a handler that
      // 500s early cannot make an emit assertion pass by finding nothing.
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(SIGN_IN_LOCATION);
      expect(res.headers.getSetCookie()).toContain(CLEARED_PKCE_COOKIE);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "auth.callback",
          message: REDIRECT_MESSAGE,
          reason: "callback_invalid_explicit_next",
          // Neither auth.* route wraps its handler in runWithRequestContext, so
          // buildRecord's ALS fallback yields null (documented limit §5.3).
          requestId: null,
        }),
      );
    });
  });

  test("site 2 — google-start, invalid EXPLICIT next → start_invalid_explicit_next", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/google/start/route");
      const request = new NextRequest(
        `${ORIGIN}/api/auth/google/start?next=${encodeURIComponent(REJECTED_NEXT)}`,
      );

      const res = await GET(request);

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(SIGN_IN_LOCATION);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.googleStart",
          message: REDIRECT_MESSAGE,
          reason: "start_invalid_explicit_next",
          requestId: null,
        }),
      );
    });
  });
});
