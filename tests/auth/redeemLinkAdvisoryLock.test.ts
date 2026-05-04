import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

import { BOOTSTRAP_COOKIE_NAME } from "@/lib/auth/constants";

const state = vi.hoisted(() => ({
  insideLock: false,
  lockCalls: [] as Array<{ showId: string; mode: string }>,
  mutationsOutsideLock: [] as string[],
  showId: "11111111-1111-4111-8111-111111111111",
  nonce: "nonce",
  crewMemberId: "22222222-2222-4222-8222-222222222222",
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
            issued_at: new Date().toISOString(),
            consumed_at: null,
            signing_key_id: "k1",
          },
          error: null,
        });
      }
      if (table === "bootstrap_nonces" && operation === "update") {
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
  });

  test("holds the show advisory lock while consuming nonce and minting link session", async () => {
    const hash = nonceHash(state.nonce);
    const request = new NextRequest("https://crew.fxav.test/api/auth/redeem-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://crew.fxav.test",
        "Sec-Fetch-Site": "same-origin",
        Cookie: `${BOOTSTRAP_COOKIE_NAME}=${encodeURIComponent(
          JSON.stringify([
            {
              nonce_hash: hash,
              show_id: state.showId,
              issued_at: new Date().toISOString(),
              signing_key_id: "k1",
            },
          ]),
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
