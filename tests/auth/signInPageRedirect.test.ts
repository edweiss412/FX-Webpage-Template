import { beforeEach, describe, expect, test, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userEmail: "crew@fxav.test",
  isAdmin: false,
}));

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectMock(path);
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { email: authState.userEmail } },
        error: null,
      }),
    },
    rpc: async (name: string) => {
      expect(name).toBe("is_admin");
      return { data: authState.isAdmin, error: null };
    },
  }),
}));

vi.mock("@/app/auth/sign-in/SignInButton", () => ({
  SignInButton: () => null,
}));

vi.mock("@/components/messages/ErrorExplainer", () => ({
  ErrorExplainer: () => null,
}));

const { default: SignInPage } = await import("@/app/auth/sign-in/page");

async function expectSignInRedirect(
  searchParams: Record<string, string | undefined>,
): Promise<string> {
  await expect(
    SignInPage({ searchParams: Promise.resolve(searchParams) }),
  ).rejects.toThrow(/^NEXT_REDIRECT:/);
  expect(redirectMock).toHaveBeenCalledTimes(1);
  const firstCall = redirectMock.mock.calls[0];
  expect(firstCall).toBeDefined();
  return firstCall![0] as string;
}

describe("sign-in page already-authenticated redirect fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userEmail = "crew@fxav.test";
    authState.isAdmin = false;
  });

  test("crew already signed in with missing next redirects to /me", async () => {
    await expect(expectSignInRedirect({})).resolves.toBe("/me");
  });

  test("crew already signed in with invalid next redirects to /me", async () => {
    await expect(
      expectSignInRedirect({ next: "https://attacker.example/x" }),
    ).resolves.toBe("/me");
  });

  test("crew already signed in with explicit /me next keeps /me", async () => {
    await expect(expectSignInRedirect({ next: "/me" })).resolves.toBe("/me");
  });

  test("crew already signed in with explicit /admin/users next redirects to /me", async () => {
    await expect(expectSignInRedirect({ next: "/admin/users" })).resolves.toBe(
      "/me",
    );
  });

  test("admin already signed in with missing next redirects to /admin", async () => {
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({})).resolves.toBe("/admin");
  });

  test("admin already signed in with explicit /admin/dev next keeps /admin/dev", async () => {
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({ next: "/admin/dev" })).resolves.toBe(
      "/admin/dev",
    );
  });

  test("admin already signed in with explicit /admin/users next keeps /admin/users", async () => {
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({ next: "/admin/users" })).resolves.toBe(
      "/admin/users",
    );
  });
});
