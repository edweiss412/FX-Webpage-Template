import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { signPickerIntent, verifyPickerIntent } from "@/lib/auth/picker/intentToken";
import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import type { LogRecord } from "@/lib/log/types";
import { messageFor } from "@/lib/messages/lookup";
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
const BOOTSTRAP_MESSAGE = "picker bootstrap refused; responding with OAUTH_REDIRECT_INVALID";

// 64 hex chars — pickerCookieSigningKey's KEY_RE.
const PICKER_SIGNING_KEY = "0123456789abcdef".repeat(4);
const SHARE_TOKEN = "a".repeat(64);
const SLUG = "east-coast";
const TOKENIZED_NEXT = `/show/${SLUG}/${SHARE_TOKEN}`;
// deriveRequestId returns `headers.get("x-vercel-id") ?? crypto.randomUUID()`
// (lib/log/requestContext.ts:25). Pinning the header is what lets the accept-set
// assert requestId against a FIXED literal — an oracle read back from the record,
// or a bare `expect.any(String)`, would admit a mutant assigning the rejected
// `next` to this promoted column.
const FIXED_REQUEST_ID = "test-req-1";

// htmlResponse renders a DIFFERENT cataloged string per code, so a branch that
// swapped to another 403 interstitial would pass a status-only check while
// changing what the user reads.
const CATALOGED_403_COPY = (() => {
  const entry = messageFor("OAUTH_REDIRECT_INVALID");
  return entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
})();

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

/**
 * The full unchanged-refusal surface for a picker-bootstrap site (AC-2). Status
 * alone does not pin it: the body assertion is load-bearing, not belt-and-braces.
 */
async function expectPickerRefusal(res: Response): Promise<void> {
  expect(res.status).toBe(403);
  expect(res.headers.get("location")).toBeNull();
  expect(await res.text()).toContain(CATALOGED_403_COPY);
}

function pickerRequest(query: string): Request {
  return new Request(`${ORIGIN}/api/auth/picker-bootstrap${query}`, {
    headers: { "x-vercel-id": FIXED_REQUEST_ID },
  });
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
    process.env.PICKER_COOKIE_SIGNING_KEY = PICKER_SIGNING_KEY;
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

  // Sites 3-5. Unlike sites 1-2 these run inside runWithRequestContext
  // (app/api/auth/picker-bootstrap/route.ts:159), so each record carries the
  // pinned requestId rather than null.
  //
  // Four distinct `reason` values over five cases (3a and 3b deliberately share
  // one, being a single branch reached two ways). A single emit hoisted above
  // the branches — which would make `reason` a constant and the whole
  // discrimination a fiction — matches at most the cases expecting that value
  // and fails the rest. No single hoist fails every case; the suite rejects
  // every possible hoist, which is the property that matters.

  test("site 3a — picker-bootstrap, ABSENT next → bootstrap_next_rejected", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
      // No `next` at all: this branch carries no `rawNext !== null` guard,
      // unlike sites 1-2, so an absent param lands here too.
      const res = await GET(pickerRequest(""));

      await expectPickerRefusal(res);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_next_rejected",
          requestId: FIXED_REQUEST_ID,
        }),
      );
    });
  });

  test("site 3b — picker-bootstrap, PRESENT rejected next → bootstrap_next_rejected", async () => {
    // The absent-value fixture above is VACUOUS for AC-4 on its own: a mutant
    // attaching the raw value only when the param is non-null emits a clean
    // record for an absent `next` and a leaking one for every real rejection.
    // This case is what makes the accept-set real at this site.
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
      const res = await GET(pickerRequest(`?next=${encodeURIComponent(REJECTED_NEXT)}`));

      await expectPickerRefusal(res);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_next_rejected",
          requestId: FIXED_REQUEST_ID,
        }),
      );
    });
  });

  test("site 4 — picker-bootstrap, next validates but is unparsable → bootstrap_unparsable_next", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");

      // PREMISE: this case needs a value that PASSES validateNextParamDetailed
      // and FAILS parseNextPath. If no such value existed the case would
      // silently drift into re-testing site 3, passing at the wrong branch.
      premiseHolds(
        "`/admin` passes validateNextParamDetailed, so this case reaches the parseNextPath branch rather than site 3",
        validateNextParamDetailed("/admin").ok,
      );

      const res = await GET(pickerRequest("?next=%2Fadmin"));

      await expectPickerRefusal(res);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_unparsable_next",
          requestId: FIXED_REQUEST_ID,
        }),
      );
    });
  });

  test("site 5a — picker-bootstrap, intent does not verify → bootstrap_intent_unverified", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
      // No `t` at all — one of the eight causes verifyPickerIntent collapses
      // into a bare null (documented limit §5.6).
      const res = await GET(pickerRequest(`?next=${encodeURIComponent(TOKENIZED_NEXT)}`));

      await expectPickerRefusal(res);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_intent_unverified",
          requestId: FIXED_REQUEST_ID,
        }),
      );
    });
  });

  test("site 5b — picker-bootstrap, VERIFIED intent naming a different target → bootstrap_intent_target_mismatch", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
      const intentToken = signPickerIntent(
        {
          // A different slug from TOKENIZED_NEXT's, so the intent verifies and
          // THEN disagrees — the one case that genuinely suggests a forged or
          // stale link.
          slug: "west-coast",
          shareToken: SHARE_TOKEN,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        PICKER_SIGNING_KEY,
      );

      // PREMISE: without this, an unverifiable token would silently make this
      // case a duplicate of 5a and the target-mismatch branch would ship
      // untested. This premise is exactly what separates (b) from (a).
      premiseHolds(
        "the constructed intent token VERIFIES, so this case reaches the target-mismatch disjunct rather than the !intent one",
        verifyPickerIntent(intentToken, PICKER_SIGNING_KEY) !== null,
      );

      const res = await GET(
        pickerRequest(
          `?next=${encodeURIComponent(TOKENIZED_NEXT)}&t=${encodeURIComponent(intentToken)}`,
        ),
      );

      await expectPickerRefusal(res);

      expectExactlyOneRedirectInvalidRecord(
        sink,
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_intent_target_mismatch",
          requestId: FIXED_REQUEST_ID,
        }),
      );
    });
  });
});
