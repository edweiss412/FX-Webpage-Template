import { beforeEach, describe, expect, test, vi } from "vitest";

const identityMock = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string | null },
  serviceRoleCalls: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: identityMock.user },
        error: null,
      }),
    },
  }),
  createSupabaseServiceRoleClient: () => {
    identityMock.serviceRoleCalls.push("createSupabaseServiceRoleClient");
    return {
      from(table: string) {
        identityMock.serviceRoleCalls.push(table);
        throw new Error(`validateGoogleIdentity must not query ${table}`);
      },
    };
  },
}));

const { validateGoogleIdentity } = await import("@/lib/auth/validateGoogleIdentity");

beforeEach(() => {
  identityMock.user = null;
  identityMock.serviceRoleCalls = [];
});

describe("validateGoogleIdentity", () => {
  test("continues when there is no Supabase Auth user", async () => {
    const result = await validateGoogleIdentity(new Request("https://crew.fxav.show/me"));
    expect(result).toEqual({ kind: "continue" });
    expect(identityMock.serviceRoleCalls).toEqual([]);
  });

  test("returns canonical cross-show identity from Supabase Auth only", async () => {
    identityMock.user = {
      id: "google-provider-sub-1",
      email: " Alice@FXAV.NET ",
    };

    const result = await validateGoogleIdentity(new Request("https://crew.fxav.show/me"));

    expect(result).toEqual({
      kind: "success",
      viewer: {
        kind: "crew",
        email: "alice@fxav.net",
        crewMemberId: "google-provider-sub-1",
      },
    });
    expect(identityMock.serviceRoleCalls).toEqual([]);
  });

  test("continues when the Supabase Auth user has no canonical email", async () => {
    identityMock.user = {
      id: "google-provider-sub-1",
      email: "   ",
    };

    const result = await validateGoogleIdentity(new Request("https://crew.fxav.show/me"));
    expect(result).toEqual({ kind: "continue" });
    expect(identityMock.serviceRoleCalls).toEqual([]);
  });
});
