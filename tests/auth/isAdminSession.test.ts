import { beforeEach, describe, expect, test, vi } from "vitest";

const adminMock = vi.hoisted(() => ({
  userEmail: null as string | null,
  missingSessionError: false,
  rpcResult: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: adminMock.userEmail ? { user: { email: adminMock.userEmail } } : { user: null },
        error: adminMock.missingSessionError
          ? {
              name: "AuthSessionMissingError",
              message: "Auth session missing!",
              status: 400,
            }
          : null,
      }),
    },
    rpc: async (name: string) => {
      expect(name).toBe("is_admin");
      return { data: adminMock.rpcResult, error: null };
    },
  }),
}));

const { isAdminSession } = await import("@/lib/auth/isAdminSession");

beforeEach(() => {
  adminMock.userEmail = null;
  adminMock.missingSessionError = false;
  adminMock.rpcResult = false;
});

describe("isAdminSession", () => {
  test("returns ok:false reason:not_admin without a Supabase user", async () => {
    adminMock.missingSessionError = true;
    // R15 #3: ok:false now carries a `reason` discriminating
    // "not_admin" (auth-level signal — chain falls through) from
    // "infra_error" (couldn't decide — surface as 500 to operators).
    await expect(isAdminSession(new Request("https://crew.fxav.show"))).resolves.toEqual({
      ok: false,
      reason: "not_admin",
    });
  });

  test("returns ok:false reason:not_admin when public.is_admin() denies", async () => {
    adminMock.userEmail = " Alice@FXAV.NET ";
    adminMock.rpcResult = false;
    await expect(isAdminSession(new Request("https://crew.fxav.show"))).resolves.toEqual({
      ok: false,
      reason: "not_admin",
    });
  });

  test("returns canonical email when public.is_admin() allows", async () => {
    adminMock.userEmail = " Alice@FXAV.NET ";
    adminMock.rpcResult = true;
    await expect(isAdminSession(new Request("https://crew.fxav.show"))).resolves.toEqual({
      ok: true,
      email: "alice@fxav.net",
    });
  });
});
