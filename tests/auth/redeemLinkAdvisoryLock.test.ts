import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  BOOTSTRAP_COOKIE_NAME,
  BOOTSTRAP_NONCE_MAX_AGE_SEC,
} from "@/lib/auth/constants";

const state = vi.hoisted(() => ({
  insideLock: false,
  lockCalls: [] as Array<{ showId: string; mode: string }>,
  mutationsOutsideLock: [] as string[],
  showId: "11111111-1111-4111-8111-111111111111",
  nonce: "nonce",
  crewMemberId: "22222222-2222-4222-8222-222222222222",
  issuedAt: new Date().toISOString(),
  consumedAt: null as string | null,
  consumeAttempts: 0,
  readErrors: new Map<string, { message: string }>(),
  crewExists: true,
  showPublished: true,
  appSettingsError: null as { message: string } | null,
  lockError: null as "show-not-found" | "generic" | null,
  /**
   * R9 #3 test support: when set, successive `single()` calls on
   * `app_settings` return values from this queue (rotation simulation).
   * Falls back to "k1" once exhausted.
   */
  signingKeyIdQueue: [] as string[],
  insertCount: 0,
  /**
   * R10 #3: simulates the active_signing_key_id value AT THE MOMENT
   * the conditional-INSERT RPC runs. Default "k1" (matches the JWT
   * mock's verifiedKid). Set to "k2" in the rotation test to simulate
   * an operator rotation committed between verifyLinkJwt() success
   * and the INSERT — the RPC's WHERE clause now mismatches
   * p_verified_kid and 0 rows are returned, surfacing as
   * LINK_REDEEM_KEY_ROTATED.
   */
  kidAtInsertTime: "k1",
}));

vi.mock("@/lib/db/advisoryLock", () => ({
  ShowAdvisoryLockShowNotFoundError: class ShowAdvisoryLockShowNotFoundError extends Error {
    constructor(showId: string) {
      super(`Show ${showId} was not found`);
      this.name = "ShowAdvisoryLockShowNotFoundError";
    }
  },
  withShowAdvisoryLock: async <T>(
    showId: string,
    mode: string,
    fn: () => T | Promise<T>,
  ): Promise<T> => {
    if (state.lockError === "show-not-found") {
      const { ShowAdvisoryLockShowNotFoundError } = await import(
        "@/lib/db/advisoryLock"
      );
      throw new ShowAdvisoryLockShowNotFoundError(showId);
    }
    if (state.lockError === "generic") {
      throw new Error("lock db failed");
    }
    state.lockCalls.push({ showId, mode });
    state.insideLock = true;
    try {
      return await fn();
    } finally {
      state.insideLock = false;
    }
  },
}));

vi.mock("@/lib/auth/jwt", () => ({
  isJwtInfraError: (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes("JWT_SIGNING_SECRET") ||
      error.message.includes("active signing key") ||
      error.message.includes("Failed to read")
    );
  },
  verifyLinkJwt: async (token: string) => {
    if (token.startsWith("infra-fail")) {
      // R16 #2: simulate JWT verifier infra/config failure (e.g.
      // missing JWT_SIGNING_SECRET). The route's catch must distinguish
      // this from a validation failure and return 500
      // ADMIN_SESSION_LOOKUP_FAILED, not 401 SESSION_NOT_FOUND.
      throw new Error("JWT_SIGNING_SECRET must be set");
    }
    if (token.startsWith("invalid-jwt")) {
      throw new Error("bad signature");
    }
    return {
      verifiedKid: "k1",
      payload: {
        showId: state.showId,
        crewMemberKey: { showId: state.showId, name: "Crew Tester" },
        tokenVersion: 1,
      },
    };
  },
}));

function nonceHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function builder(table: string) {
  let operation = "select";
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    update() {
      operation = "update";
      if (!state.insideLock) state.mutationsOutsideLock.push(`${table}.update`);
      return this;
    },
    insert() {
      if (!state.insideLock) state.mutationsOutsideLock.push(`${table}.insert`);
      state.insertCount += 1;
      return { error: null };
    },
    single() {
      const next = state.signingKeyIdQueue.shift() ?? "k1";
      return Promise.resolve({
        data: state.appSettingsError ? null : { active_signing_key_id: next },
        error: state.appSettingsError,
      });
    },
    maybeSingle() {
      const readError = state.readErrors.get(`${table}:select`);
      if (table === "bootstrap_nonces" && operation === "select") {
        if (readError) {
          return Promise.resolve({ data: null, error: readError });
        }
        return Promise.resolve({
          data: {
            nonce_hash: nonceHash(state.nonce),
            show_id: state.showId,
            issued_at: state.issuedAt,
            consumed_at: state.consumedAt,
            signing_key_id: "k1",
          },
          error: null,
        });
      }
      if (table === "bootstrap_nonces" && operation === "update") {
        state.consumeAttempts += 1;
        if (state.consumedAt !== null) {
          return Promise.resolve({ data: null, error: null });
        }
        state.consumedAt = new Date().toISOString();
        return Promise.resolve({ data: { nonce_hash: nonceHash(state.nonce) }, error: null });
      }
      if (table === "crew_members") {
        if (readError) {
          return Promise.resolve({ data: null, error: readError });
        }
        if (!state.crewExists) {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({
          data: { id: state.crewMemberId, show_id: state.showId, name: "Crew Tester" },
          error: null,
        });
      }
      if (table === "crew_member_auth") {
        if (readError) {
          return Promise.resolve({ data: null, error: readError });
        }
        return Promise.resolve({
          data: { current_token_version: 1, revoked_below_version: 0 },
          error: null,
        });
      }
      if (table === "revoked_links" && readError) {
        return Promise.resolve({ data: null, error: readError });
      }
      if (table === "shows") {
        if (readError) {
          return Promise.resolve({ data: null, error: readError });
        }
        return Promise.resolve({
          data: { id: state.showId, published: state.showPublished },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: builder,
    rpc: async (
      name: string,
      params: { p_verified_kid: string; p_token: string },
    ) => {
      if (name !== "mint_link_session_if_active_kid_matches") {
        return { data: null, error: { message: `unknown rpc: ${name}` } };
      }
      // R10 #3: emulates Postgres conditional INSERT semantics. If the
      // active kid at insert time matches p_verified_kid, the RPC's
      // INSERT ... SELECT ... WHERE active_signing_key_id = $verified_kid
      // returns the inserted token row; otherwise zero rows.
      if (params.p_verified_kid !== state.kidAtInsertTime) {
        return { data: [], error: null };
      }
      state.insertCount += 1;
      return { data: [{ token: params.p_token }], error: null };
    },
  }),
}));

const { POST } = await import("@/app/api/auth/redeem-link/route");

describe("/api/auth/redeem-link advisory lock", () => {
  beforeEach(() => {
    state.insideLock = false;
    state.lockCalls = [];
    state.mutationsOutsideLock = [];
    state.issuedAt = new Date().toISOString();
    state.consumedAt = null;
    state.consumeAttempts = 0;
    state.signingKeyIdQueue = [];
    state.insertCount = 0;
    state.kidAtInsertTime = "k1";
    state.readErrors.clear();
    state.crewExists = true;
    state.showPublished = true;
    state.appSettingsError = null;
    state.lockError = null;
  });

  function requestFor(options: {
    token?: string;
    cookieEntries?: Array<{
      nonce_hash: string;
      show_id: string;
      issued_at: string;
      signing_key_id: string;
    }>;
  } = {}): NextRequest {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: "https://crew.fxav.test",
      "Sec-Fetch-Site": "same-origin",
    };
    if (options.cookieEntries) {
      headers.Cookie = `${BOOTSTRAP_COOKIE_NAME}=${encodeURIComponent(
        JSON.stringify(options.cookieEntries),
      )}`;
    }
    return new NextRequest("https://crew.fxav.test/api/auth/redeem-link", {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: options.token ?? "signed-jwt",
        nonce: state.nonce,
        show_id: state.showId,
      }),
    });
  }

  function matchingCookieEntry() {
    return {
      nonce_hash: nonceHash(state.nonce),
      show_id: state.showId,
      issued_at: state.issuedAt,
      signing_key_id: "k1",
    };
  }

  test.each([
    "bootstrap_nonces:select",
    "crew_members:select",
    "crew_member_auth:select",
    "revoked_links:select",
  ])("%s errors return ADMIN_SESSION_LOOKUP_FAILED", async (errorKey) => {
    state.readErrors.set(errorKey, { message: "fake DB outage" });

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });

  test("missing bootstrap cookie returns CSRF_DENIED without consuming nonce", async () => {
    const response = await POST(requestFor());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
    expect(state.consumeAttempts).toBe(0);
    expect(state.consumedAt).toBeNull();
  });

  test("app_settings active signing key lookup errors return ADMIN_SESSION_LOOKUP_FAILED", async () => {
    state.appSettingsError = { message: "fake DB outage" };

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });

  test("unknown show_id from advisory-lock lookup returns CSRF_DENIED", async () => {
    state.lockError = "show-not-found";

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
  });

  test("generic advisory-lock failure returns ADMIN_SESSION_LOOKUP_FAILED", async () => {
    state.lockError = "generic";

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });

  test("bootstrap cookie mismatch returns CSRF_DENIED without consuming nonce", async () => {
    const response = await POST(
      requestFor({
        cookieEntries: [
          {
            nonce_hash: nonceHash("different nonce"),
            show_id: state.showId,
            issued_at: state.issuedAt,
            signing_key_id: "k1",
          },
        ],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
    expect(state.consumeAttempts).toBe(0);
    expect(state.consumedAt).toBeNull();
  });

  test("valid bootstrap cookie consumes nonce and mints link session", async () => {
    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(200);
    expect(state.consumeAttempts).toBe(1);
    expect(state.consumedAt).toEqual(expect.any(String));
  });

  test("R12 #1: redeem strips consumed entry from __Host-fxav_bootstrap_v cookie", async () => {
    // Round-11 §A MEDIUM: consumed entries must be removed from the
    // bootstrap cookie array on successful redeem so they don't take
    // up slots in the 5-entry cap and evict still-unredeemed entries
    // from other open tabs.
    const otherEntry = {
      nonce_hash: "deadbeef".repeat(8),
      show_id: state.showId,
      issued_at: new Date().toISOString(),
      signing_key_id: "k1",
    };
    const consumedEntry = matchingCookieEntry();

    const response = await POST(
      requestFor({
        cookieEntries: [otherEntry, consumedEntry],
      }),
    );

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    const bootstrapHeader = setCookies.find((line) =>
      line.startsWith("__Host-fxav_bootstrap_v="),
    );
    expect(bootstrapHeader).toBeDefined();
    // Consumed entry's nonce_hash MUST NOT appear in the rewritten value.
    expect(bootstrapHeader).not.toContain(consumedEntry.nonce_hash);
    // The other (untouched) entry MUST still appear.
    expect(bootstrapHeader).toContain(otherEntry.nonce_hash);
  });

  test("R13 #4: post-consume failure path also strips the consumed entry from bootstrap cookie", async () => {
    // Round-12 §B MEDIUM: R12 #1 only cleaned up on the 200 success
    // path. Post-consume failures (invalid JWT, missing crew, version
    // mismatch, revoked, DB read errors) also burn the nonce — and
    // must also strip the consumed entry so multi-tab onboarding
    // doesn't suffer the same eviction class R12 #1 was meant to close.
    // This test exercises the invalid-JWT path; the same applyCleanup
    // helper covers all other post-consume returns.
    const otherEntry = {
      nonce_hash: "cafebabe".repeat(8),
      show_id: state.showId,
      issued_at: new Date().toISOString(),
      signing_key_id: "k1",
    };
    const consumedEntry = matchingCookieEntry();

    const response = await POST(
      requestFor({
        token: "invalid-jwt-x",
        cookieEntries: [otherEntry, consumedEntry],
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "SESSION_NOT_FOUND" });
    expect(state.consumedAt).toEqual(expect.any(String));
    const setCookies = response.headers.getSetCookie();
    const bootstrapHeader = setCookies.find((line) =>
      line.startsWith("__Host-fxav_bootstrap_v="),
    );
    expect(bootstrapHeader).toBeDefined();
    expect(bootstrapHeader).not.toContain(consumedEntry.nonce_hash);
    expect(bootstrapHeader).toContain(otherEntry.nonce_hash);
  });

  test("R12 #1: redeem clears bootstrap cookie when no entries remain after consume", async () => {
    // When the redeemed entry was the only one in the cookie, the
    // cookie must be cleared (Max-Age=0) — empty array on the wire
    // would still take up a cookie slot.
    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    const bootstrapHeader = setCookies.find((line) =>
      line.startsWith("__Host-fxav_bootstrap_v="),
    );
    expect(bootstrapHeader).toBeDefined();
    expect(bootstrapHeader).toContain("Max-Age=0");
  });

  test("valid JWT for unpublished show cannot mint a link session", async () => {
    state.showPublished = false;

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
    // R9 #1: gate runs BEFORE nonce consume so the bootstrap proof is
    // not burned on unpublished shows.
    expect(state.consumedAt).toBeNull();
    expect(state.insertCount).toBe(0);
  });

  test("invalid JWT for unpublished show returns CSRF_DENIED without consuming nonce (anti-oracle)", async () => {
    // R9 #1 anti-oracle: the response for an unpublished show must be
    // byte-equal regardless of whether the JWT would have verified, the
    // crew exists, or the version matched — any divergence leaks
    // unpublished-show existence + auth-state to a non-admin probe.
    state.showPublished = false;

    const response = await POST(
      requestFor({
        token: "invalid-jwt-z",
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
    expect(state.consumedAt).toBeNull();
    expect(state.insertCount).toBe(0);
  });

  test("rotation between JWT verify and INSERT returns LINK_REDEEM_KEY_ROTATED", async () => {
    // R10 #3: operator rotates app_settings.active_signing_key_id
    // between the verifyLinkJwt() success and the conditional-INSERT
    // RPC. Pre-R10 the route did a TS-side fresh re-read (R9 #3) which
    // narrowed but didn't close the race; pre-R9 the route compared
    // against a stale early read entirely. The R10 RPC moves the
    // check-and-insert into one Postgres statement, so a rotation
    // committed between verifyLinkJwt and the INSERT is observed
    // atomically: zero rows from INSERT ... SELECT ... WHERE
    // active_signing_key_id = $verifiedKid → LINK_REDEEM_KEY_ROTATED.
    //
    // Mock sequence: kidAtInsertTime="k2" simulates an operator
    // rotation that committed AFTER the route's early read of "k1"
    // (used for the cookie/nonce kid match) but BEFORE the conditional
    // INSERT runs. The JWT mock returns verifiedKid="k1", so the RPC's
    // WHERE clause mismatches and 0 rows are returned.
    state.kidAtInsertTime = "k2";

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "LINK_REDEEM_KEY_ROTATED",
    });
    expect(state.insertCount).toBe(0);
    // No __Host-fxav_session Set-Cookie — no session minted. The
    // bootstrap-cookie cleanup (R13 #4) IS expected on every post-
    // consume return, so we look for the absence of the session
    // cookie specifically rather than asserting no Set-Cookie at all.
    const setCookies = response.headers.getSetCookie();
    expect(
      setCookies.find((line) => line.startsWith("__Host-fxav_session=")),
    ).toBeUndefined();
  });

  test("invalid JWT consumes nonce before returning SESSION_NOT_FOUND", async () => {
    const response = await POST(
      requestFor({
        token: "invalid-jwt-a",
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "SESSION_NOT_FOUND" });
    expect(state.consumedAt).toEqual(expect.any(String));
  });

  test("missing crew consumes nonce before returning LINK_NO_CREW_MATCH", async () => {
    state.crewExists = false;

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ code: "LINK_NO_CREW_MATCH" });
    expect(state.consumedAt).toEqual(expect.any(String));
  });

  test("same nonce cannot enumerate multiple invalid JWT outcomes", async () => {
    const firstResponse = await POST(
      requestFor({
        token: "invalid-jwt-a",
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(firstResponse.status).toBe(401);
    await expect(firstResponse.json()).resolves.toEqual({ code: "SESSION_NOT_FOUND" });
    expect(state.consumedAt).toEqual(expect.any(String));

    const secondResponse = await POST(
      requestFor({
        token: "invalid-jwt-b",
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(secondResponse.status).toBe(403);
    await expect(secondResponse.json()).resolves.toEqual({ code: "CSRF_DENIED" });
  });

  test("revoked-links read error returns 500 after consuming nonce", async () => {
    state.readErrors.set("revoked_links:select", { message: "fake DB outage" });

    const failedResponse = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(failedResponse.status).toBe(500);
    await expect(failedResponse.json()).resolves.toEqual({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(state.consumedAt).toEqual(expect.any(String));
  });

  test("replaying a consumed bootstrap nonce returns CSRF_DENIED", async () => {
    const firstResponse = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );
    expect(firstResponse.status).toBe(200);

    const replayResponse = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(replayResponse.status).toBe(403);
    await expect(replayResponse.json()).resolves.toEqual({ code: "CSRF_DENIED" });
  });

  test("expired nonce with matching cookie returns CSRF_NONCE_EXPIRED", async () => {
    state.issuedAt = new Date(
      Date.now() - (BOOTSTRAP_NONCE_MAX_AGE_SEC + 1) * 1000,
    ).toISOString();

    const response = await POST(
      requestFor({
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_NONCE_EXPIRED" });
  });

  test("holds the show advisory lock while consuming nonce and minting link session", async () => {
    const request = new NextRequest("https://crew.fxav.test/api/auth/redeem-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://crew.fxav.test",
        "Sec-Fetch-Site": "same-origin",
        Cookie: `${BOOTSTRAP_COOKIE_NAME}=${encodeURIComponent(
          JSON.stringify([matchingCookieEntry()]),
        )}`,
      },
      body: JSON.stringify({
        token: "signed-jwt",
        nonce: state.nonce,
        show_id: state.showId,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(state.lockCalls).toEqual([{ showId: state.showId, mode: "block" }]);
    expect(state.mutationsOutsideLock).toEqual([]);
  });

  test("R16 #2: JWT verifier infra/config failure returns 500 ADMIN_SESSION_LOOKUP_FAILED, not 401 SESSION_NOT_FOUND", async () => {
    // Round-15 §A MEDIUM: pre-fix, every verifyLinkJwt() throw mapped
    // to 401 SESSION_NOT_FOUND. Config faults like missing
    // JWT_SIGNING_SECRET masqueraded as invalid-link auth errors and
    // operators lost the server-fault signal. R16 #2 routes
    // isJwtInfraError() throws to 500 ADMIN_SESSION_LOOKUP_FAILED
    // matching middleware's R13 #3 distinction.
    const response = await POST(
      requestFor({
        token: "infra-fail-secret-missing",
        cookieEntries: [matchingCookieEntry()],
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
  });
});
