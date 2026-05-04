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
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { SignInButton } from "@/app/auth/sign-in/SignInButton";

// In-memory state shared by `vi.mock` factory AND each test. Tests can:
//   - read `state.calls` to inspect what the island passed to the SDK
//   - set `state.errorOverride` to exercise the SDK's `{ data, error }`
//     failure-to-initiate path (I1 fix)
//   - set `state.deferred` to a deferred promise so the SDK call BLOCKS
//     until the test releases it (lets us observe the in-flight pending
//     render before React commits the post-await state updates) (I3 fix)
const supabaseMock = vi.hoisted(() => {
  return {
    state: {
      calls: [] as Array<{
        provider: string;
        options: { redirectTo?: string; queryParams?: Record<string, string> };
      }>,
      errorOverride: null as { message: string } | null,
      deferred: null as {
        promise: Promise<void>;
        release: () => void;
      } | null,
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
          // If a deferred is set, block until the test releases it. This
          // lets the test observe the in-flight pending render before
          // the SDK await resolves and React commits setPending(false).
          if (supabaseMock.state.deferred !== null) {
            await supabaseMock.state.deferred.promise;
          }
          if (supabaseMock.state.errorOverride !== null) {
            return { data: {}, error: supabaseMock.state.errorOverride };
          }
          return { data: {}, error: null };
        },
      },
    }),
  };
});

describe("SignInButton (client island)", () => {
  beforeEach(() => {
    supabaseMock.state.calls = [];
    supabaseMock.state.errorOverride = null;
    supabaseMock.state.deferred = null;
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

  /**
   * Helper: click the sign-in button and flush the SDK's async tail.
   *
   * `act(async () => ...)` is the React-blessed pattern: it waits for the
   * click handler's await chain (signInWithOAuth) to settle, including
   * the subsequent state updates (setPending(false), setLastError(...)),
   * and surfaces React's "you forgot to wrap in act" warnings as test
   * failures. Replaces the previous fragile `await Promise.resolve()`
   * microtask-drain pattern (which broke when the handler grew an
   * additional await for the I1 error-handling fix).
   */
  async function clickAndFlush(button: HTMLElement) {
    await act(async () => {
      fireEvent.click(button);
    });
  }

  test("renders a <button> with accessible 'Sign in with Google' text", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    const button = getByTestId("sign-in-with-google");
    expect(button.tagName.toLowerCase()).toBe("button");
    expect(button.textContent).toMatch(/sign in with google/i);
  });

  test("initial render: button text is 'Sign in with Google' and is not disabled", () => {
    // I3 contract: pending text must NOT appear until a click is in flight.
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    const button = getByTestId("sign-in-with-google") as HTMLButtonElement;
    expect(button.textContent).toBe("Sign in with Google");
    expect(button.disabled).toBe(false);
  });

  test("click invokes supabase.auth.signInWithOAuth with the canonical shape", async () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    await clickAndFlush(getByTestId("sign-in-with-google"));

    expect(supabaseMock.state.calls).toHaveLength(1);
    const call = supabaseMock.state.calls[0]!;
    expect(call.provider).toBe("google");
    expect(call.options.queryParams).toEqual({ prompt: "select_account" });
  });

  test("redirectTo embeds the validatedNext value as a ?next= query param on /auth/callback", async () => {
    const { getByTestId } = render(
      <SignInButton validatedNext="/show/foo-bar" />,
    );
    await clickAndFlush(getByTestId("sign-in-with-google"));

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
    await clickAndFlush(getByTestId("sign-in-with-google"));

    const call = supabaseMock.state.calls[0]!;
    const url = new URL(call.options.redirectTo!);
    expect(url.searchParams.get("next")).toBe("/admin");
  });

  test("validatedNext with a slug containing dashes round-trips through the redirectTo URL", async () => {
    const { getByTestId } = render(
      <SignInButton validatedNext="/show/abc-def-123" />,
    );
    await clickAndFlush(getByTestId("sign-in-with-google"));

    const call = supabaseMock.state.calls[0]!;
    const url = new URL(call.options.redirectTo!);
    expect(url.searchParams.get("next")).toBe("/show/abc-def-123");
  });

  // ── I1 contract: SDK's `{ data, error }` non-throw failure path ──
  // The Supabase JS client returns `{ data, error }` and does NOT throw
  // on SDK-level failures (provider not enabled, project misconfigured,
  // network). The previous catch-only error handling silently swallowed
  // these — leaving the user with a re-enabled button and no feedback.
  // The fix surfaces a generic operator-friendly inline error.
  //
  // Concrete failure mode this catches: a regression that drops the
  // `if (error) setLastError(...)` branch would re-introduce the silent
  // strand bug; the inline error wouldn't render and this test fails.
  test("when signInWithOAuth resolves with an error, surfaces a generic inline error and re-enables the button", async () => {
    supabaseMock.state.errorOverride = { message: "provider not enabled" };
    const { getByTestId, queryByTestId } = render(
      <SignInButton validatedNext="/admin" />,
    );
    const button = getByTestId("sign-in-with-google") as HTMLButtonElement;
    await clickAndFlush(button);

    // The pending flag was cleared (button is interactive again for retry).
    expect(button.disabled).toBe(false);
    // The button text reverted to the idle CTA.
    expect(button.textContent).toBe("Sign in with Google");

    // The inline error is rendered with the generic operator-friendly
    // copy and role="alert" so AT users hear it immediately.
    const inlineError = queryByTestId("sign-in-inline-error");
    expect(inlineError).not.toBeNull();
    expect(inlineError!.getAttribute("role")).toBe("alert");
    expect(inlineError!.textContent).toBe(
      "Couldn't start sign-in. Please try again, or ask Doug for help if this keeps happening.",
    );
  });

  test("happy path does NOT render the inline error block", async () => {
    // Sanity check: the inline error is gated on `lastError !== null`.
    // Default-success-path renders no error.
    const { getByTestId, queryByTestId } = render(
      <SignInButton validatedNext="/admin" />,
    );
    await clickAndFlush(getByTestId("sign-in-with-google"));
    expect(queryByTestId("sign-in-inline-error")).toBeNull();
  });

  // ── I3 + M3 contract: pending state communicates via text + disabled ──
  // aria-busy on a <button> is questionable ARIA; with a dynamic
  // accessible name + disabled, AT users get the proper pending-state
  // feedback. Concrete failure mode: a regression that reverts to a
  // static "Sign in with Google" label while pending leaves the disabled
  // button announced with no reason; this test fails.
  test("during pending: button text is 'Signing in…' AND disabled is set AND aria-busy is NOT present", async () => {
    // Hold the SDK promise open via the mock's deferred mechanism so we
    // can observe the in-flight render BEFORE setPending(false) commits.
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    supabaseMock.state.deferred = { promise, release };

    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    const button = getByTestId("sign-in-with-google") as HTMLButtonElement;

    // Kick off the click. Wrap in act so React commits the synchronous
    // setPending(true) state update; the SDK await is still pending
    // (deferred.promise is unresolved), so post-await updates have NOT
    // committed yet. We don't await act's body settling here because
    // the body would await indefinitely on the deferred — instead we
    // start the click, observe the in-flight DOM, then release.
    //
    // act's contract: when the body returns synchronously, React flushes
    // synchronous updates. We split this into two phases:
    //   Phase 1: click + read in-flight DOM (React has flushed
    //            setPending(true) but the SDK await hasn't resolved).
    //   Phase 2: release the deferred + await the post-await flush.
    await act(async () => {
      fireEvent.click(button);
    });

    // Phase 1: the SDK call started but hasn't resolved (deferred is
    // still unreleased). The click handler is suspended at the await.
    expect(button.textContent).toBe("Signing in…");
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute("aria-busy")).toBe(false);

    // Phase 2: release the deferred and let the post-await state
    // updates (setPending(false)) commit.
    await act(async () => {
      release();
      // Yield twice to let the awaited deferred resolve and the
      // subsequent setState commit.
      await Promise.resolve();
      await Promise.resolve();
    });

    // Post-pending: button reverted to idle CTA.
    expect(button.textContent).toBe("Sign in with Google");
    expect(button.disabled).toBe(false);
  });

  test("button never carries an aria-busy attribute (M3: aria-busy belongs on container roles, not buttons)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/admin" />);
    const button = getByTestId("sign-in-with-google");
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });
});
