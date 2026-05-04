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
  revokedRows: [] as unknown[],
  alertThrows: false,
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
      upsert: async (payload: unknown) => {
        if (!leakedState.revokedUpsertFails) {
          leakedState.revokedRows.push(payload);
        }
        return {
          error: leakedState.revokedUpsertFails
            ? { message: "revoked upsert failed" }
            : null,
        };
      },
    };
  }
  if (table === "admin_alerts") {
    return {
      upsert: async (payload: unknown) => {
        leakedState.alertUpserts.push(payload);
        if (leakedState.alertThrows) {
          throw new Error("alert failed");
        }
        return { error: null };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: tableClient,
    rpc: async (name: string, params: Record<string, unknown>) => {
      expect(name).toBe("revoke_leaked_link_atomic");
      if (leakedState.authReadFails) {
        return { data: null, error: { message: "auth read failed" } };
      }
      if (leakedState.revokedUpsertFails) {
        return { data: null, error: { message: "revoked upsert failed" } };
      }
      if (leakedState.authUpdateFails) {
        return { data: null, error: { message: "auth update failed" } };
      }
      if (!leakedState.authRow) {
        return { data: { branch: "no_op" }, error: null };
      }
      const tokenVersion = Number(params.p_token_version);
      if (tokenVersion <= leakedState.authRow.current_token_version) {
        leakedState.revokedRows.push({
          show_id: params.p_show_id,
          crew_name: params.p_crew_name,
          token_version: tokenVersion,
          revoked_reason: "leaked_query_token",
        });
      }
      return { data: { branch: "ok" }, error: null };
    },
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
    leakedState.alertThrows = false;
    leakedState.authRow = {
      show_id: "11111111-1111-4111-8111-111111111111",
      crew_name: "Crew Tester",
      current_token_version: 3,
      max_issued_version: 3,
      revoked_below_version: 0,
    };
    leakedState.alertUpserts = [];
    leakedState.revokedRows = [];
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

  test("alert persistence failure does not mask leaked-link revocation failure", async () => {
    leakedState.authUpdateFails = true;
    leakedState.alertThrows = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    await expect(expectJson(response)).resolves.toMatchObject({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(leakedState.alertUpserts).toHaveLength(1);
  });

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

  test("update failure after revoked-link insert does not leave partial revoked row", async () => {
    leakedState.authUpdateFails = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    await expect(expectJson(response)).resolves.toMatchObject({
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    expect(leakedState.revokedRows).toEqual([]);
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
