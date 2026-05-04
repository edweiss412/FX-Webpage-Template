import { beforeEach, describe, expect, test, vi } from "vitest";

const adminMock = vi.hoisted(() => ({
  userEmail: null as string | null,
  rpcResult: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: adminMock.userEmail
          ? { user: { email: adminMock.userEmail } }
          : { user: null },
        error: null,
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
  adminMock.rpcResult = false;
});

describe("isAdminSession", () => {
  test("returns ok:false without a Supabase user", async () => {
    await expect(isAdminSession(new Request("https://crew.fxav.show"))).resolves.toEqual({
      ok: false,
    });
  });

  test("returns ok:false when public.is_admin() denies", async () => {
    adminMock.userEmail = " Alice@FXAV.NET ";
    adminMock.rpcResult = false;
    await expect(isAdminSession(new Request("https://crew.fxav.show"))).resolves.toEqual({
      ok: false,
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
