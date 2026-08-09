import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { signPickerIntent, verifyPickerIntent } from "@/lib/auth/picker/intentToken";
import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { hashForLog } from "@/lib/email/hashForLog";
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
 * `stampOauthClaim` emits this BEFORE site 1's redirect-invalid branch
 * (app/auth/callback/route.ts). It is shipped behavior, so it is pinned as part
 * of site 1's expected sink rather than filtered away — filtering is exactly the
 * hole this helper exists to close.
 */
const SIGN_IN_SUCCEEDED_RECORD: Record<string, unknown> = {
  level: "info",
  source: "auth.callback",
  message: "OAUTH_SIGN_IN_SUCCEEDED",
  code: "OAUTH_SIGN_IN_SUCCEEDED",
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: hashForLog("crew@fxav.test"),
  context: {},
};

/**
 * The accept-set spans the ENTIRE captured sink, in order — NOT the records
 * filtered to the code under test.
 *
 * Filtering first was a real hole, found by whole-diff review and demonstrated
 * with a passing mutant run: a handler could emit its correct record and then a
 * SECOND durable record under a different code carrying the raw rejected `next`
 * or the whole service-account JSON, and every assertion here stayed green —
 * cardinality, deep-equal, and the secrets backstop alike, since all three
 * looked only at the filtered subset. That is not a hypothetical shape on this
 * route: the adjacent shipped emits deliberately persist FORENSIC codes distinct
 * from the user-facing one, so "add a sibling emit under a new code" is the most
 * likely next edit anyone makes in this file.
 *
 * Asserting the whole sink also subsumes cardinality: a duplicate emit, a
 * missing one, and a reordering all fail the same comparison.
 */
function expectWholeSink(
  sink: LogRecord[],
  expected: ReadonlyArray<Record<string, unknown>>,
): void {
  expect(sink).toEqual(expected);
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

/**
 * AC-7: the sink RECORDS before it throws. Recording is not convenience — it is
 * what makes the premise possible. With no emit at all a throwing sink is never
 * invoked and the route works fine, so an unguarded case would pass against a
 * tree carrying no telemetry whatsoever.
 */
async function withThrowingSink<T>(run: (seen: LogRecord[]) => Promise<T>): Promise<T> {
  vi.resetModules();
  const seen: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    seen.push(record);
    throw new Error("sink-down");
  });
  try {
    return await run(seen);
  } finally {
    log.resetLogSink();
  }
}

/**
 * A generic "the sink was entered" flag is VACUOUS at site 1: stampOauthClaim
 * emits OAUTH_SIGN_IN_SUCCEEDED before the redirect-invalid branch, so the flag
 * is already true whether or not the new emit exists. A class sweep found site 1
 * is the only site with a preceding emit, but the premise is written
 * code-specifically at every site anyway — a generic form is one refactor away
 * from being vacuous anywhere.
 */
function premiseThisSiteEmitted(seen: LogRecord[], code: string, reason: string): void {
  premiseHolds(
    `the throwing sink saw THIS site's record (code ${code}, reason ${reason}), so the refusal assertion below is observing a wrapper that actually ran`,
    seen.some((r) => r.code === code && r.context.reason === reason),
  );
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

      expectWholeSink(sink, [
        SIGN_IN_SUCCEEDED_RECORD,
        expectedRedirectInvalidRecord({
          source: "auth.callback",
          message: REDIRECT_MESSAGE,
          reason: "callback_invalid_explicit_next",
          // Neither auth.* route wraps its handler in runWithRequestContext, so
          // buildRecord's ALS fallback yields null (documented limit §5.3).
          requestId: null,
        }),
      ]);
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

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.googleStart",
          message: REDIRECT_MESSAGE,
          reason: "start_invalid_explicit_next",
          requestId: null,
        }),
      ]);
    });
  });

  /**
   * SUCCESS PATHS — the other half of "exactly one record", and the half every
   * failure case is structurally blind to.
   *
   * Each case above drives a REFUSAL, so all of them stay green against an emit
   * HOISTED above its guard: the record still appears, with the right `reason`,
   * on the branch they exercise. The consequence is a durable FALSE failure row
   * for healthy traffic — every successful sign-in filed as a rejected `next`,
   * which is worse than the silence this arc set out to fix, because an operator
   * would act on it.
   *
   * Each case asserts the whole sink on a request that passes its site's guard.
   */
  describe("success paths emit nothing about a rejected next", () => {
    test("site 1 — callback with a VALID next emits only the shipped sign-in record", async () => {
      await withCapture(async (sink) => {
        const { GET } = await import("@/app/auth/callback/route");
        const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=%2Fme`));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/me");

        // stampOauthClaim's record and NOTHING else — in particular no
        // OAUTH_REDIRECT_INVALID, which a hoisted emit would add here.
        expectWholeSink(sink, [SIGN_IN_SUCCEEDED_RECORD]);
      });
    });

    test("site 1 — callback with NO code takes the OAUTH_STATE_INVALID branch and emits nothing", async () => {
      // The nearest-neighbour refusal on the same route. It is a DIFFERENT
      // cataloged failure, so an emit that widened or hoisted into it would file
      // it as a rejected `next` — a wrong durable label on a real failure, which
      // no other case here can see.
      await withCapture(async (sink) => {
        const { GET } = await import("@/app/auth/callback/route");
        const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?next=%2Fme`));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(
          "/auth/sign-in?code=OAUTH_STATE_INVALID&next=%2Fme",
        );

        expectWholeSink(sink, []);
      });
    });

    test("site 2 — google-start with an ABSENT next emits nothing", async () => {
      // The other side of site 2's `rawNext !== null` guard, which spec §2.1
      // calls out as the difference between this site and picker site 3: an
      // absent `next` must NOT be reported as a rejected one. Dropping that
      // conjunct is invisible to every refusal case.
      await withCapture(async (sink) => {
        const { GET } = await import("@/app/api/auth/google/start/route");
        const res = await GET(new NextRequest(`${ORIGIN}/api/auth/google/start`));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://accounts.google.test/o/oauth2/auth");

        expectWholeSink(sink, []);
      });
    });

    test("site 2 — google-start with a VALID next emits nothing", async () => {
      await withCapture(async (sink) => {
        const { GET } = await import("@/app/api/auth/google/start/route");
        const res = await GET(new NextRequest(`${ORIGIN}/api/auth/google/start?next=%2Fme`));

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("https://accounts.google.test/o/oauth2/auth");

        expectWholeSink(sink, []);
      });
    });

    test("sites 3-5 — a request PAST all three picker guards emits nothing", async () => {
      await withCapture(async (sink) => {
        const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
        const intentToken = signPickerIntent(
          { slug: SLUG, shareToken: SHARE_TOKEN, exp: Math.floor(Date.now() / 1000) + 3600 },
          PICKER_SIGNING_KEY,
        );
        // Resolve the show to nothing, so the handler stops at the NEXT guard
        // after the three under test. That is the cheapest request that is
        // provably past all three without standing up the whole claim flow.
        state.serviceRpc.mockResolvedValue({ data: null, error: null });

        const res = await GET(
          pickerRequest(
            `?next=${encodeURIComponent(TOKENIZED_NEXT)}&t=${encodeURIComponent(intentToken)}`,
          ),
        );

        // Still a 403, but a DIFFERENT cataloged one — which is the positive
        // proof that all three OAUTH_REDIRECT_INVALID guards were passed rather
        // than the request having died at one of them.
        expect(res.status).toBe(403);
        const invalidShareTokenEntry = messageFor("PICKER_INVALID_SHARE_TOKEN");
        expect(await res.text()).toContain(
          invalidShareTokenEntry.crewFacing ?? invalidShareTokenEntry.dougFacing ?? "",
        );

        expectWholeSink(sink, []);
      });
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

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_next_rejected",
          requestId: FIXED_REQUEST_ID,
        }),
      ]);
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

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_next_rejected",
          requestId: FIXED_REQUEST_ID,
        }),
      ]);
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

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_unparsable_next",
          requestId: FIXED_REQUEST_ID,
        }),
      ]);
    });
  });

  test("site 5a — picker-bootstrap, intent does not verify → bootstrap_intent_unverified", async () => {
    await withCapture(async (sink) => {
      const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
      // No `t` at all — one of the eight causes verifyPickerIntent collapses
      // into a bare null (documented limit §5.6).
      const res = await GET(pickerRequest(`?next=${encodeURIComponent(TOKENIZED_NEXT)}`));

      await expectPickerRefusal(res);

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_intent_unverified",
          requestId: FIXED_REQUEST_ID,
        }),
      ]);
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

      expectWholeSink(sink, [
        expectedRedirectInvalidRecord({
          source: "api.auth.pickerBootstrap",
          message: BOOTSTRAP_MESSAGE,
          reason: "bootstrap_intent_target_mismatch",
          requestId: FIXED_REQUEST_ID,
        }),
      ]);
    });
  });

  /**
   * AC-7 — the fail-open contract. Every emit in this arc is try/catch-wrapped so
   * a telemetry fault can never escape over the caller (invariant 9, spec limit
   * §5.5), and nothing above tests that: removing the wrapper from all six sites
   * leaves every other assertion in this file green.
   *
   * The wrappers are load-bearing, not decorative. Against a rejecting sink an
   * unwrapped emit replaces the refusal with an unhandled rejection — the 302
   * never happens, the 403 never happens — converting a handled, cataloged
   * failure into an unhandled one on a public auth endpoint. That is strictly
   * worse than the missing telemetry this arc set out to fix.
   *
   * These cases start GREEN, since the wrappers land with the emits. Their RED is
   * obtained per site by removing that site's try/catch and observing the refusal
   * collapse; see the commit message for the six observations.
   */
  describe("fail-open: a throwing sink never replaces the refusal", () => {
    test("site 1 — callback still redirects and still clears the PKCE cookie", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/auth/callback/route");
        const request = new NextRequest(
          `${ORIGIN}/auth/callback?code=abc&next=${encodeURIComponent(REJECTED_NEXT)}`,
          { headers: { cookie: `${PKCE_COOKIE}=verifier-value` } },
        );

        const res = await GET(request);

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "callback_invalid_explicit_next");

        // Same whole-sink accept-set as the capture cases: a `catch` that
        // introduced a leaking sibling emit would otherwise ship unseen.
        expectWholeSink(seen, [
          SIGN_IN_SUCCEEDED_RECORD,
          expectedRedirectInvalidRecord({
            source: "auth.callback",
            message: REDIRECT_MESSAGE,
            reason: "callback_invalid_explicit_next",
            requestId: null,
          }),
        ]);

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(SIGN_IN_LOCATION);
        expect(res.headers.getSetCookie()).toContain(CLEARED_PKCE_COOKIE);
      });
    });

    test("site 2 — google-start still redirects", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/api/auth/google/start/route");
        const res = await GET(
          new NextRequest(
            `${ORIGIN}/api/auth/google/start?next=${encodeURIComponent(REJECTED_NEXT)}`,
          ),
        );

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "start_invalid_explicit_next");

        // Same whole-sink accept-set as the capture cases: a `catch` that
        // introduced a leaking sibling emit would otherwise ship unseen.
        expectWholeSink(seen, [
          expectedRedirectInvalidRecord({
            source: "api.auth.googleStart",
            message: REDIRECT_MESSAGE,
            reason: "start_invalid_explicit_next",
            requestId: null,
          }),
        ]);

        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(SIGN_IN_LOCATION);
      });
    });

    test("site 3 — picker-bootstrap still returns the cataloged 403", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
        const res = await GET(pickerRequest(`?next=${encodeURIComponent(REJECTED_NEXT)}`));

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "bootstrap_next_rejected");

        // Same whole-sink accept-set as the capture cases: a `catch` that
        // introduced a leaking sibling emit would otherwise ship unseen.
        expectWholeSink(seen, [
          expectedRedirectInvalidRecord({
            source: "api.auth.pickerBootstrap",
            message: BOOTSTRAP_MESSAGE,
            reason: "bootstrap_next_rejected",
            requestId: FIXED_REQUEST_ID,
          }),
        ]);

        await expectPickerRefusal(res);
      });
    });

    test("site 4 — picker-bootstrap still returns the cataloged 403", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
        const res = await GET(pickerRequest("?next=%2Fadmin"));

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "bootstrap_unparsable_next");

        // Same whole-sink accept-set as the capture cases: a `catch` that
        // introduced a leaking sibling emit would otherwise ship unseen.
        expectWholeSink(seen, [
          expectedRedirectInvalidRecord({
            source: "api.auth.pickerBootstrap",
            message: BOOTSTRAP_MESSAGE,
            reason: "bootstrap_unparsable_next",
            requestId: FIXED_REQUEST_ID,
          }),
        ]);

        await expectPickerRefusal(res);
      });
    });

    test("site 5a — picker-bootstrap still returns the cataloged 403", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
        const res = await GET(pickerRequest(`?next=${encodeURIComponent(TOKENIZED_NEXT)}`));

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "bootstrap_intent_unverified");

        // Same whole-sink accept-set as the capture cases: a `catch` that
        // introduced a leaking sibling emit would otherwise ship unseen.
        expectWholeSink(seen, [
          expectedRedirectInvalidRecord({
            source: "api.auth.pickerBootstrap",
            message: BOOTSTRAP_MESSAGE,
            reason: "bootstrap_intent_unverified",
            requestId: FIXED_REQUEST_ID,
          }),
        ]);

        await expectPickerRefusal(res);
      });
    });

    /**
     * Site 5 is ONE emit statement but TWO runtime paths, because its `reason` is
     * a ternary. "One case per emit site" therefore under-counts here: a
     * fail-open regression scoped to the target-mismatch arm — a `catch (error)
     * { if (intent) throw error; }` — leaves the 5a case above completely green,
     * since 5a's fixture never produces an `intent`. The two arms share a
     * wrapper, not a code path through it.
     */
    test("site 5b — a VERIFIED, mismatched intent still returns the cataloged 403", async () => {
      await withThrowingSink(async (seen) => {
        const { GET } = await import("@/app/api/auth/picker-bootstrap/route");
        const intentToken = signPickerIntent(
          {
            slug: "west-coast",
            shareToken: SHARE_TOKEN,
            exp: Math.floor(Date.now() / 1000) + 3600,
          },
          PICKER_SIGNING_KEY,
        );

        premiseHolds(
          "the constructed intent token VERIFIES, so this case exercises the target-mismatch arm rather than collapsing into 5a",
          verifyPickerIntent(intentToken, PICKER_SIGNING_KEY) !== null,
        );

        const res = await GET(
          pickerRequest(
            `?next=${encodeURIComponent(TOKENIZED_NEXT)}&t=${encodeURIComponent(intentToken)}`,
          ),
        );

        premiseThisSiteEmitted(seen, "OAUTH_REDIRECT_INVALID", "bootstrap_intent_target_mismatch");

        expectWholeSink(seen, [
          expectedRedirectInvalidRecord({
            source: "api.auth.pickerBootstrap",
            message: BOOTSTRAP_MESSAGE,
            reason: "bootstrap_intent_target_mismatch",
            requestId: FIXED_REQUEST_ID,
          }),
        ]);

        await expectPickerRefusal(res);
      });
    });
  });
});
