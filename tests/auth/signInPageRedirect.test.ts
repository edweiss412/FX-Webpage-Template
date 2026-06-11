import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { messageFor } from "@/lib/messages/lookup";

const authState = vi.hoisted(() => ({
  userEmail: "crew@fxav.test",
  isAdmin: false,
  // When non-null, getUser RESOLVES with this exact result instead of
  // the default signed-in user — exercises the returned-error (not
  // thrown) classification branch (root-landing spec §4.1.5).
  getUserResult: null as null | { data: { user: unknown }; error: unknown },
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
      getUser: async () => {
        if (authState.getUserResult !== null) {
          return authState.getUserResult;
        }
        return {
          data: { user: { email: authState.userEmail } },
          error: null,
        };
      },
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

// Spec §4.1.5 tests below assert the RENDERED catalog copy, so the
// real ErrorExplainer (a pure Server Component) is used. The redirect
// tests never render, so they are unaffected.
vi.mock("@/components/messages/ErrorExplainer", async (importOriginal) => importOriginal());

const { default: SignInPage } = await import("@/app/auth/sign-in/page");

async function expectSignInRedirect(
  searchParams: Record<string, string | undefined>,
): Promise<string> {
  await expect(SignInPage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow(
    /^NEXT_REDIRECT:/,
  );
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
    authState.getUserResult = null;
  });

  test("crew already signed in with missing next redirects to /me", async () => {
    await expect(expectSignInRedirect({})).resolves.toBe("/me");
  });

  test("crew already signed in with invalid next redirects to /me", async () => {
    await expect(expectSignInRedirect({ next: "https://attacker.example/x" })).resolves.toBe("/me");
  });

  test("crew already signed in with explicit /me next keeps /me", async () => {
    await expect(expectSignInRedirect({ next: "/me" })).resolves.toBe("/me");
  });

  test("crew already signed in with explicit /admin/users next redirects to /me", async () => {
    await expect(expectSignInRedirect({ next: "/admin/users" })).resolves.toBe("/me");
  });

  test("admin already signed in with missing next redirects to /admin", async () => {
    // M9 final-review R15: DEFAULT_AUTH_NEXT_PATH restored to
    // "/admin" after R15 created the production-safe landing
    // (app/admin/page.tsx). R14's /admin/dev intermediate fix was
    // reverted because /admin/dev is build-gated out of prod.
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({})).resolves.toBe("/admin");
  });

  test("admin already signed in with explicit /admin/dev next keeps /admin/dev", async () => {
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({ next: "/admin/dev" })).resolves.toBe("/admin/dev");
  });

  test("admin already signed in with explicit /admin/users next keeps /admin/users", async () => {
    authState.userEmail = "admin@fxav.test";
    authState.isAdmin = true;

    await expect(expectSignInRedirect({ next: "/admin/users" })).resolves.toBe("/admin/users");
  });
});

// Root-landing spec §4.1.5: a RETURNED non-missing getUser error is
// auth infrastructure failing, not "no session" — the page must surface
// the same ADMIN_SESSION_LOOKUP_FAILED block the thrown path gets,
// while returned MISSING-SESSION errors keep the plain-CTA fall-through.
describe("sign-in page returned getUser error classification (spec §4.1.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userEmail = "crew@fxav.test";
    authState.isAdmin = false;
    authState.getUserResult = null;
  });

  test("returned NON-missing error → error block with ADMIN_SESSION_LOOKUP_FAILED crew copy, no redirect", async () => {
    authState.getUserResult = {
      data: { user: null },
      error: { name: "AuthApiError", message: "Database error", status: 500 },
    };

    const element = await SignInPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(html).toContain('data-testid="sign-in-error-block"');
    // Expected copy resolves via the CREW-facing catalog field — this
    // row has dougFacing: null, so getRequiredDougFacing would throw,
    // and the page renders ErrorExplainer with surface="crew".
    const crewCopy = messageFor("ADMIN_SESSION_LOOKUP_FAILED").crewFacing;
    expect(crewCopy).toBeTruthy();
    expect(html).toContain(crewCopy as string);
  });

  test("returned AuthSessionMissingError still falls through to plain CTA (no error block)", async () => {
    authState.getUserResult = {
      data: { user: null },
      error: { name: "AuthSessionMissingError", message: "Auth session missing!" },
    };

    const element = await SignInPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(html).not.toContain('data-testid="sign-in-error-block"');
    // The plain CTA path still renders the page shell.
    expect(html).toContain('data-testid="sign-in-page"');
  });
});
