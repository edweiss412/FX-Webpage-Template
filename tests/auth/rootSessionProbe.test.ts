import { describe, expect, test, vi } from "vitest";

const serverMock = vi.hoisted(() => ({
  impl: null as null | (() => Promise<unknown>),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => serverMock.impl!(),
}));

function clientWithGetUser(result: unknown) {
  return { auth: { getUser: async () => result } };
}

import { rootSessionProbe } from "@/lib/auth/rootSessionProbe";

describe("rootSessionProbe", () => {
  test("valid user → authenticated", async () => {
    serverMock.impl = async () =>
      clientWithGetUser({ data: { user: { id: "u1", email: "a@b.c" } }, error: null });
    expect(await rootSessionProbe()).toEqual({ kind: "authenticated" });
  });
  test("no user, no error → anonymous", async () => {
    serverMock.impl = async () => clientWithGetUser({ data: { user: null }, error: null });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned AuthSessionMissingError (name shape) → anonymous", async () => {
    serverMock.impl = async () =>
      clientWithGetUser({
        data: { user: null },
        error: { name: "AuthSessionMissingError", message: "x" },
      });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned missing-session (message shape, supabaseAuthError.ts:10) → anonymous", async () => {
    serverMock.impl = async () =>
      clientWithGetUser({
        data: { user: null },
        error: { name: "AuthApiError", message: "Auth session missing!" },
      });
    expect(await rootSessionProbe()).toEqual({ kind: "anonymous" });
  });
  test("returned NON-missing error (status-500 AuthApiError shape) → infra_error", async () => {
    serverMock.impl = async () =>
      clientWithGetUser({
        data: { user: null },
        error: { name: "AuthApiError", message: "Database error", status: 500 },
      });
    const r = await rootSessionProbe();
    expect(r.kind).toBe("infra_error");
  });
  test("getUser THROW → infra_error (resolves, never rejects)", async () => {
    serverMock.impl = async () => ({
      auth: {
        getUser: async () => {
          throw new Error("network reset");
        },
      },
    });
    await expect(rootSessionProbe()).resolves.toMatchObject({ kind: "infra_error" });
  });
  test("construction THROW → infra_error (resolves, never rejects)", async () => {
    serverMock.impl = async () => {
      throw new Error("missing env");
    };
    await expect(rootSessionProbe()).resolves.toMatchObject({ kind: "infra_error" });
  });
});
