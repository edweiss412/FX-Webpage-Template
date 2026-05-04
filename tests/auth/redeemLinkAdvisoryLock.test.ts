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
}));

vi.mock("@/lib/db/advisoryLock", () => ({
  withShowAdvisoryLock: async <T>(
    showId: string,
    mode: string,
    fn: () => T | Promise<T>,
  ): Promise<T> => {
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
  verifyLinkJwt: async () => ({
    verifiedKid: "k1",
    payload: {
      showId: state.showId,
      crewMemberKey: { showId: state.showId, name: "Crew Tester" },
      tokenVersion: 1,
    },
  }),
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
      return { error: null };
    },
    single() {
      return Promise.resolve({
        data: { active_signing_key_id: "k1" },
        error: null,
      });
    },
    maybeSingle() {
      if (table === "bootstrap_nonces" && operation === "select") {
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
        return Promise.resolve({
          data: { id: state.crewMemberId, show_id: state.showId, name: "Crew Tester" },
          error: null,
        });
      }
      if (table === "crew_member_auth") {
        return Promise.resolve({
          data: { current_token_version: 1, revoked_below_version: 0 },
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
  });

  function requestFor(options: {
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
        token: "signed-jwt",
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

  test("missing bootstrap cookie returns CSRF_DENIED without consuming nonce", async () => {
    const response = await POST(requestFor());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "CSRF_DENIED" });
    expect(state.consumeAttempts).toBe(0);
    expect(state.consumedAt).toBeNull();
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
});
