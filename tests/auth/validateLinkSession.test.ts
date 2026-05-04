import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  encodeSessionCookieValue,
  SESSION_COOKIE_MAX_AGE_SEC,
} from "@/lib/auth/cookies";

type LinkSessionRow = {
  token: string;
  show_id: string;
  crew_member_id: string | null;
  jwt_token_version: number;
  signing_key_id: string;
  expires_at: string;
  last_active_at: string;
};

type CrewRow = { id: string; show_id: string; name: string };
type AuthRow = {
  current_token_version: number;
  revoked_below_version: number;
};

const mockDb = vi.hoisted(() => ({
  activeSigningKeyId: "k1",
  linkSessions: new Map<string, LinkSessionRow>(),
  crewMembers: new Map<string, CrewRow>(),
  crewAuth: new Map<string, AuthRow>(),
  revokedLinks: new Set<string>(),
  errors: new Map<string, { message: string }>(),
  deletedTokens: [] as string[],
  touchedTokens: [] as string[],
}));

function authKey(showId: string, crewName: string): string {
  return `${showId}:${crewName}`;
}

function revokedKey(showId: string, crewName: string, tokenVersion: number): string {
  return `${showId}:${crewName}:${tokenVersion}`;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      return tableClient(table);
    },
  }),
}));

function tableClient(table: string) {
  if (table === "app_settings") {
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { active_signing_key_id: mockDb.activeSigningKeyId },
            error: null,
          }),
        }),
      }),
    };
  }
  if (table === "link_sessions") {
    return {
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({
            data: mockDb.linkSessions.get(value) ?? null,
            error: mockDb.errors.get("link_sessions:select") ?? null,
          }),
        }),
      }),
      delete: () => ({
        eq: (_column: string, value: string) => {
          mockDb.deletedTokens.push(value);
          mockDb.linkSessions.delete(value);
          return Promise.resolve({ error: null });
        },
      }),
      update: () => ({
        eq: (_column: string, value: string) => {
          mockDb.touchedTokens.push(value);
          const row = mockDb.linkSessions.get(value);
          if (row) row.last_active_at = new Date().toISOString();
          return Promise.resolve({ error: null });
        },
      }),
    };
  }
  if (table === "crew_members") {
    return {
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: async () => ({
            data: mockDb.crewMembers.get(value) ?? null,
            error: mockDb.errors.get("crew_members:select") ?? null,
          }),
        }),
      }),
    };
  }
  if (table === "crew_member_auth") {
    return {
      select: () => ({
        eq: (_column: string, showId: string) => ({
          eq: (_column2: string, crewName: string) => ({
            maybeSingle: async () => ({
              data: mockDb.crewAuth.get(authKey(showId, crewName)) ?? null,
              error: mockDb.errors.get("crew_member_auth:select") ?? null,
            }),
          }),
        }),
      }),
    };
  }
  if (table === "revoked_links") {
    return {
      select: () => ({
        eq: (_column: string, showId: string) => ({
          eq: (_column2: string, crewName: string) => ({
            eq: (_column3: string, tokenVersion: number) => ({
              maybeSingle: async () => ({
                data: mockDb.revokedLinks.has(
                  revokedKey(showId, crewName, tokenVersion),
                )
                  ? { token_version: tokenVersion }
                  : null,
                error: mockDb.errors.get("revoked_links:select") ?? null,
              }),
            }),
          }),
        }),
      }),
    };
  }
  throw new Error(`unexpected table ${table}`);
}

const { validateLinkSession } = await import("@/lib/auth/validateLinkSession");

const showId = "22222222-2222-4222-8222-222222222222";
const otherShowId = "33333333-3333-4333-8333-333333333333";
const crewMemberId = "44444444-4444-4444-8444-444444444444";
const sessionToken = "11111111-1111-4111-8111-111111111111";

function makeReq(cookieValue?: string): Request {
  return new Request("https://crew.fxav.show/show/test-show", {
    headers:
      cookieValue === undefined
        ? {}
        : { Cookie: `__Host-fxav_session=${cookieValue}` },
  });
}

function seedValidSession(overrides: Partial<LinkSessionRow> = {}) {
  mockDb.crewMembers.set(crewMemberId, {
    id: crewMemberId,
    show_id: showId,
    name: "Eric Weiss",
  });
  mockDb.crewAuth.set(authKey(showId, "Eric Weiss"), {
    current_token_version: 3,
    revoked_below_version: 0,
  });
  mockDb.linkSessions.set(sessionToken, {
    token: sessionToken,
    show_id: showId,
    crew_member_id: crewMemberId,
    jwt_token_version: 3,
    signing_key_id: "k1",
    expires_at: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SEC * 1000).toISOString(),
    last_active_at: new Date().toISOString(),
    ...overrides,
  });
}

function cookieFor(show_id = showId, token = sessionToken): string {
  return encodeSessionCookieValue({ token, show_id });
}

beforeEach(() => {
  mockDb.activeSigningKeyId = "k1";
  mockDb.linkSessions.clear();
  mockDb.crewMembers.clear();
  mockDb.crewAuth.clear();
  mockDb.revokedLinks.clear();
  mockDb.errors.clear();
  mockDb.deletedTokens = [];
  mockDb.touchedTokens = [];
});

describe("validateLinkSession", () => {
  test("missing cookie continues without clearing", async () => {
    const result = await validateLinkSession(makeReq(), { showId });
    expect(result).toEqual({ kind: "continue" });
  });

  test("malformed cookie continues and asks caller to clear it", async () => {
    const result = await validateLinkSession(makeReq("%xy"), { showId });
    expect(result).toEqual({ kind: "continue", clearCookie: true });
  });

  test("valid session succeeds with identity-only viewer and advances idle window", async () => {
    seedValidSession();
    const result = await validateLinkSession(makeReq(cookieFor()), { showId });
    expect(result).toEqual({
      kind: "success",
      viewer: { kind: "crew", showId, crewMemberId },
    });
    expect(mockDb.touchedTokens).toEqual([sessionToken]);
    expect(mockDb.linkSessions.has(sessionToken)).toBe(true);
  });

  test.each([
    {
      name: "absolute timeout",
      rowOverrides: { expires_at: new Date(Date.now() - 1000).toISOString() },
      status: 401,
      code: "SESSION_ABSOLUTE_TIMEOUT",
    },
    {
      name: "crew removed",
      rowOverrides: { crew_member_id: null },
      status: 410,
      code: "LINK_NO_CREW_MATCH",
    },
    {
      name: "version mismatch",
      rowOverrides: { jwt_token_version: 2 },
      status: 410,
      code: "LINK_VERSION_MISMATCH",
    },
    {
      name: "revocation floor",
      rowOverrides: { jwt_token_version: 3 },
      status: 410,
      code: "LINK_REVOKED_FLOOR",
      authOverrides: { revoked_below_version: 3 },
    },
    {
      name: "idle timeout",
      rowOverrides: {
        last_active_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      },
      status: 401,
      code: "SESSION_IDLE_TIMEOUT",
    },
  ] as const)(
    "%s deletes the link session and returns a recoverable prior failure",
    async ({ rowOverrides, status, code, authOverrides }) => {
      seedValidSession(rowOverrides);
      if (authOverrides) {
        mockDb.crewAuth.set(authKey(showId, "Eric Weiss"), {
          current_token_version: 3,
          revoked_below_version: authOverrides.revoked_below_version,
        });
      }
      const result = await validateLinkSession(makeReq(cookieFor()), { showId });
      expect(result).toEqual({
        kind: "continue",
        clearCookie: true,
        priorFailure: { status, code },
      });
      expect(mockDb.linkSessions.has(sessionToken)).toBe(false);
      expect(mockDb.deletedTokens).toEqual([sessionToken]);
    },
  );

  test("signing-key rotation is a terminal failure and deletes the session", async () => {
    seedValidSession();
    mockDb.activeSigningKeyId = "k2";
    const result = await validateLinkSession(makeReq(cookieFor()), { showId });
    expect(result).toEqual({
      kind: "terminal_failure",
      status: 401,
      code: "LINK_SESSION_KEY_ROTATED",
      clearCookie: true,
    });
    expect(mockDb.linkSessions.has(sessionToken)).toBe(false);
  });

  test("cross-show cookie reuse deletes the offending session and continues", async () => {
    seedValidSession();
    const result = await validateLinkSession(makeReq(cookieFor(showId)), {
      showId: otherShowId,
    });
    expect(result).toEqual({ kind: "continue", clearCookie: true });
    expect(mockDb.linkSessions.has(sessionToken)).toBe(false);
  });

  test("surgical revocation deletes the session and returns LINK_REVOKED_SURGICAL", async () => {
    seedValidSession();
    mockDb.revokedLinks.add(revokedKey(showId, "Eric Weiss", 3));
    const result = await validateLinkSession(makeReq(cookieFor()), { showId });
    expect(result).toEqual({
      kind: "continue",
      clearCookie: true,
      priorFailure: { status: 410, code: "LINK_REVOKED_SURGICAL" },
    });
    expect(mockDb.linkSessions.has(sessionToken)).toBe(false);
  });

  test.each([
    "link_sessions:select",
    "crew_members:select",
    "crew_member_auth:select",
    "revoked_links:select",
  ])(
    "%s errors return terminal failure without deleting the session",
    async (errorKey) => {
      seedValidSession();
      mockDb.errors.set(errorKey, { message: "fake DB outage" });

      const result = await validateLinkSession(makeReq(cookieFor()), { showId });

      expect(result).toEqual({
        kind: "terminal_failure",
        status: 500,
        code: "ADMIN_SESSION_LOOKUP_FAILED",
      });
      expect(mockDb.deletedTokens).toEqual([]);
      expect(mockDb.linkSessions.has(sessionToken)).toBe(true);
    },
  );
});
