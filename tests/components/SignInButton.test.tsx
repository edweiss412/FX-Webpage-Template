// @vitest-environment jsdom
/**
 * tests/components/SignInButton.test.tsx (M5 §B Task 5.8 — Opus's portion)
 *
 * Pins the public contract of <SignInButton> — the small `'use client'`
 * island wrapped by app/auth/sign-in/page.tsx that turns a click into a
 * Supabase OAuth handoff.
 *
 * Why a client island at all? Server Components cannot trigger client-side
 * SDK calls. The Server Component validates `searchParams.next` (via
 * lib/auth/validateNextParam) and passes the validated value down as a
 * prop; the island reads its own `window.location.origin` at click time
 * to construct the absolute callback URL Supabase expects.
 *
 * Spec contract (Task 5.8 §B prompt):
 *   - Renders a <button> with accessible "Sign in with Google" text.
 *   - On click, invokes supabase.auth.signInWithOAuth with shape:
 *       {
 *         provider: 'google',
 *         options: {
 *           redirectTo: '<origin>/auth/callback?next=<validatedNext>',
 *           queryParams: { prompt: 'select_account' },
 *         },
 *       }
 *   - The redirectTo URL embeds `validatedNext` as a `?next=` query param
 *     on /auth/callback. The island does NOT re-validate; it trusts the
 *     pre-validated prop (the Server Component is the single source of
 *     truth for the validation contract).
 *
 * Anti-tautology: the assertion compares the call args against an
 * expected URL constructed independently in the test (NOT against the
 * island's internal URL-construction code). If the island drifts from
 * the contract — e.g., omits `prompt: select_account` or constructs the
 * wrong redirectTo — the assertion fails.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { SignInButton } from "@/app/auth/sign-in/SignInButton";

// In-memory state shared by `vi.mock` factory AND each test.
const supabaseMock = vi.hoisted(() => {
  return {
    state: {
      calls: [] as Array<{
        provider: string;
        options: { redirectTo?: string; queryParams?: Record<string, string> };
      }>,
    },
  };
});

vi.mock("@/lib/supabase/browser", () => {
  return {
    getSupabaseBrowserClient: () => ({
      auth: {
        signInWithOAuth: async (params: {
          provider: string;
          options: {
            redirectTo?: string;
            queryParams?: Record<string, string>;
          };
        }) => {
          // exactOptionalPropertyTypes: only set keys when defined so
          // the recorded call mirrors what the island passed.
          const recordedOptions: {
            redirectTo?: string;
            queryParams?: Record<string, string>;
          } = {};
          if (params.options.redirectTo !== undefined) {
            recordedOptions.redirectTo = params.options.redirectTo;
          }
          if (params.options.queryParams !== undefined) {
            recordedOptions.queryParams = params.options.queryParams;
          }
          supabaseMock.state.calls.push({
            provider: params.provider,
            options: recordedOptions,
          });
          return { data: {}, error: null };
        },
      },
    }),
  };
});

describe("SignInButton (client island)", () => {
  beforeEach(() => {
    supabaseMock.state.calls = [];
    // jsdom defaults window.location to about:blank — set a stable origin
    // so the redirectTo URL the island constructs is deterministic.
    Object.defineProperty(window, "location", {
      value: new URL("http://localhost:3000/auth/sign-in"),
      writable: true,
    });
  });
  afterEach(() => {
    cleanup();
  });

  test("renders a <button> with accessible 'Sign in with Google' text", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    const button = getByTestId("sign-in-with-google");
    expect(button.tagName.toLowerCase()).toBe("button");
    expect(button.textContent).toMatch(/sign in with google/i);
  });

  test("click invokes supabase.auth.signInWithOAuth with the canonical shape", async () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    fireEvent.click(getByTestId("sign-in-with-google"));
    // Microtask drain — signInWithOAuth is async; the click handler
    // awaits it, so we let the microtask queue flush before asserting.
    await Promise.resolve();
    await Promise.resolve();

    expect(supabaseMock.state.calls).toHaveLength(1);
    const call = supabaseMock.state.calls[0]!;
    expect(call.provider).toBe("google");
    expect(call.options.queryParams).toEqual({ prompt: "select_account" });
  });

  test("redirectTo embeds the validatedNext value as a ?next= query param on /auth/callback", async () => {
    const { getByTestId } = render(
      <SignInButton validatedNext="/show/foo-bar" />,
    );
    fireEvent.click(getByTestId("sign-in-with-google"));
    await Promise.resolve();
    await Promise.resolve();

    const call = supabaseMock.state.calls[0]!;
    expect(call.options.redirectTo).toBeTruthy();
    const url = new URL(call.options.redirectTo!);
    // Anti-tautology: re-derive the expected URL from the same window
    // origin the island reads — but assert each PIECE independently
    // (origin, pathname, query param) so a drift in any one piece fails.
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/show/foo-bar");
  });

  test("validatedNext='/admin' produces /auth/callback?next=/admin (default fallback shape)", async () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    fireEvent.click(getByTestId("sign-in-with-google"));
    await Promise.resolve();
    await Promise.resolve();

    const call = supabaseMock.state.calls[0]!;
    const url = new URL(call.options.redirectTo!);
    expect(url.searchParams.get("next")).toBe("/admin");
  });

  test("validatedNext with a slug containing dashes round-trips through the redirectTo URL", async () => {
    const { getByTestId } = render(
      <SignInButton validatedNext="/show/abc-def-123" />,
    );
    fireEvent.click(getByTestId("sign-in-with-google"));
    await Promise.resolve();
    await Promise.resolve();

    const call = supabaseMock.state.calls[0]!;
    const url = new URL(call.options.redirectTo!);
    expect(url.searchParams.get("next")).toBe("/show/abc-def-123");
  });
});
