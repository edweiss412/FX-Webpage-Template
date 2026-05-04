"use client";

/**
 * app/auth/sign-in/SignInButton.tsx (M5 §B Task 5.8 — Opus's portion)
 *
 * The only `'use client'` boundary on the sign-in page. The Server
 * Component (page.tsx) handles:
 *   - Active-session detection + early redirect (the redirect-loop guard).
 *   - validateNextParam on `searchParams.next`.
 *   - Error-block rendering via <ErrorExplainer>.
 * This island handles only the OAuth SDK call, which can't run server-side.
 *
 * Why a client island instead of a Server Action POST that hits Supabase?
 *   The `signInWithOAuth` SDK call constructs a Google authorization URL
 *   (with PKCE state cookies it writes to the browser context) and
 *   returns a URL to navigate to. The cookies it writes (PKCE verifier,
 *   etc.) MUST land on the browser context, not the server's response
 *   for an unrelated redirect — running this server-side would split the
 *   PKCE handshake across hosts. The browser-side SDK call is the
 *   Supabase-blessed pattern (per @supabase/ssr docs).
 *
 * The button text is "Sign in with Google" — accessible label that
 * doubles as the visible CTA. We deliberately don't add a Google logo
 * SVG inline; the next-pass design polish task can extend the visual
 * presentation. The contract enforced here is: button + click handler +
 * supabase.auth.signInWithOAuth with the canonical shape.
 *
 * DESIGN.md tokens used (from app/globals.css):
 *   - bg-accent / text-accent-text — the orange-on-near-black accent pair
 *   - hover:bg-accent-hover — hover variant
 *   - focus-visible:ring-focus-ring — accessible focus ring
 *   - min-h-tap-min / min-w-tap-min — 44×44 minimum tap target (§3 token)
 *   - rounded-sm — same chip as the AlertBanner's Resolve button
 *   - px-4 py-2 — same paddings as the AlertBanner's Resolve button
 */
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export type SignInButtonProps = {
  /**
   * The post-sign-in destination, ALREADY validated by the parent Server
   * Component via `validateNextParam`. The island trusts this prop and
   * does NOT re-validate — the validation contract is owned by the
   * Server Component (single source of truth, defensive against drift).
   */
  validatedNext: string;
};

export function SignInButton({ validatedNext }: SignInButtonProps) {
  // Disable the button while the SDK call is in flight to prevent double-
  // submits (which would create racing PKCE verifier cookies). The SDK
  // navigates the page on success so we never have to clear this flag in
  // the success path; the error path re-enables for retry.
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      // Build the absolute redirectTo URL from the live window origin so
      // dev (127.0.0.1:3000), preview, and prod each get a same-origin
      // callback URL without env wiring. The /auth/callback route is the
      // §A handler that exchanges the code for a session.
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("next", validatedNext);

      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl.toString(),
          queryParams: {
            // Force the Google account chooser even when the user has a
            // single Google session active in the browser. This is the
            // crew-onboarding path; users should always be able to
            // pick which Google account to authenticate with.
            prompt: "select_account",
          },
        },
      });
      // On success the SDK navigates the page to Google; control doesn't
      // typically return here. If it does (e.g., popup-blocked variant),
      // re-enable the button so the user can retry.
      setPending(false);
    } catch {
      // Defensive: any synchronous throw from the SDK shouldn't strand
      // the button in a disabled state. The error catalog code goes
      // through the OAuth callback's redirect path, so we don't surface
      // it inline here.
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="sign-in-with-google"
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
    >
      Sign in with Google
    </button>
  );
}
