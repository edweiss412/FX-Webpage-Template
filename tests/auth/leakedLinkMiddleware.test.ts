import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const leakedState = vi.hoisted(() => ({
  verifyFails: false,
  lockFails: false,
  authReadFails: false,
  revokedUpsertFails: false,
  authUpdateFails: false,
  authRow: {
    show_id: "11111111-1111-4111-8111-111111111111",
    crew_name: "Crew Tester",
    current_token_version: 3,
    max_issued_version: 3,
    revoked_below_version: 0,
  } as {
    show_id: string;
    crew_name: string;
    current_token_version: number;
    max_issued_version: number;
    revoked_below_version: number;
  } | null,
  alertUpserts: [] as unknown[],
}));

vi.mock("@/lib/auth/jwt", () => ({
  verifyLinkJwt: async () => {
    if (leakedState.verifyFails) {
      throw new Error("bad signature");
    }
    return {
      payload: {
        crewMemberKey: {
          showId: "11111111-1111-4111-8111-111111111111",
          name: "Crew Tester",
        },
        tokenVersion: 3,
      },
    };
  },
}));

vi.mock("@/lib/db/advisoryLock", () => ({
  withShowAdvisoryLock: async <T>(
    _showId: string,
    _mode: string,
    fn: () => T | Promise<T>,
  ): Promise<T> => {
    if (leakedState.lockFails) {
      throw new Error("lock failed");
    }
    return await fn();
  },
}));

function tableClient(table: string) {
  if (table === "crew_member_auth") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: leakedState.authReadFails ? null : leakedState.authRow,
              error: leakedState.authReadFails
                ? { message: "auth read failed" }
                : null,
            }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: async () => ({
            error: leakedState.authUpdateFails
              ? { message: "auth update failed" }
              : null,
          }),
        }),
      }),
    };
  }
  if (table === "revoked_links") {
    return {
      upsert: async () => ({
        error: leakedState.revokedUpsertFails
          ? { message: "revoked upsert failed" }
          : null,
      }),
    };
  }
  if (table === "admin_alerts") {
    return {
      upsert: async (payload: unknown) => {
        leakedState.alertUpserts.push(payload);
        return { error: null };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: tableClient,
  }),
}));

const { middleware } = await import("../../middleware");

function leakedRequest(): NextRequest {
  return new NextRequest("https://crew.fxav.test/show/test-show?t=signed-jwt");
}

async function expectJson(response: Response) {
  return (await response.json()) as { code: string };
}

describe("middleware leaked-link revocation", () => {
  beforeEach(() => {
    leakedState.verifyFails = false;
    leakedState.lockFails = false;
    leakedState.authReadFails = false;
    leakedState.revokedUpsertFails = false;
    leakedState.authUpdateFails = false;
    leakedState.authRow = {
      show_id: "11111111-1111-4111-8111-111111111111",
      crew_name: "Crew Tester",
      current_token_version: 3,
      max_issued_version: 3,
      revoked_below_version: 0,
    };
    leakedState.alertUpserts = [];
  });

  test.each([
    ["advisory lock", () => (leakedState.lockFails = true)],
    ["crew auth read", () => (leakedState.authReadFails = true)],
    ["revoked link upsert", () => (leakedState.revokedUpsertFails = true)],
    ["crew auth update", () => (leakedState.authUpdateFails = true)],
  ])(
    "%s failure returns ADMIN_SESSION_LOOKUP_FAILED instead of false leaked-link success",
    async (_name, setup) => {
      setup();

      const response = await middleware(leakedRequest());

      expect(response.status).toBe(503);
      await expect(expectJson(response)).resolves.toMatchObject({
        code: "ADMIN_SESSION_LOOKUP_FAILED",
      });
      expect(leakedState.alertUpserts).toHaveLength(1);
    },
  );

  test("JWT verification failure still returns LEAKED_LINK_DETECTED", async () => {
    leakedState.verifyFails = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    await expect(expectJson(response)).resolves.toMatchObject({
      code: "LEAKED_LINK_DETECTED",
    });
    expect(leakedState.alertUpserts).toEqual([]);
  });

  test("successful leaked-link revocation returns LEAKED_LINK_DETECTED", async () => {
    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    await expect(expectJson(response)).resolves.toMatchObject({
      code: "LEAKED_LINK_DETECTED",
    });
    expect(leakedState.alertUpserts).toEqual([]);
  });

  test("already-revoked leaked link remains idempotent LEAKED_LINK_DETECTED", async () => {
    leakedState.authRow = {
      show_id: "11111111-1111-4111-8111-111111111111",
      crew_name: "Crew Tester",
      current_token_version: 4,
      max_issued_version: 4,
      revoked_below_version: 4,
    };

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    await expect(expectJson(response)).resolves.toMatchObject({
      code: "LEAKED_LINK_DETECTED",
    });
  });
});
