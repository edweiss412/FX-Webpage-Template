/**
 * app/auth/sign-in/page.tsx (M5 §B Task 5.8 — Opus's portion)
 *
 * Server Component. The single user-facing surface for Google OAuth
 * sign-in. Three responsibilities:
 *
 *   1. Redirect-loop guard. If a valid Supabase Auth session is already
 *      present, 302/redirect immediately to validateNextParam(next) —
 *      no point re-running OAuth on every visit. This is the explicit
 *      "already signed in" early-exit per the §B prompt.
 *
 *   2. Render the sign-in CTA. The actual SDK call lives in the
 *      <SignInButton> client island (the SDK can't run on the server).
 *      The Server Component pre-validates `next` once so the island
 *      doesn't re-validate.
 *
 *   3. Optionally render an error block. When the OAuth callback
 *      bounces back with `?code=...`, validateErrorCodeParam allowlists
 *      it (§12.4 invariant 5: only OAUTH_STATE_INVALID and
 *      OAUTH_REDIRECT_INVALID, the two codes the callback emits) and
 *      <ErrorExplainer surface="crew" /> renders the catalog copy.
 *      Anything else (unknown code, XSS, malformed) silently renders
 *      nothing — attackers never learn what the validator rejected.
 *
 * Inputs come from Next.js's typed `searchParams` prop. In Next 16,
 * page-level `searchParams` is a Promise of `Record<string, string |
 * string[] | undefined>`. Per Next 16 docs we await it before reading.
 *
 * Per AGENTS.md invariant 5: every line of human-visible copy is
 * either page chrome (the headline / subhead, written below) or
 * routes through the catalog via <ErrorExplainer>. No raw catalog
 * codes ever land in the DOM (the only `code` value in JSX is the
 * MessageCode prop the explainer consumes — which never re-renders
 * the literal string).
 */
import Link from "next/link";
import { redirect } from "next/navigation";

import { isAdminSession } from "@/lib/auth/isAdminSession";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateNextParam } from "@/lib/auth/validateNextParam";
import type { MessageCode } from "@/lib/messages/catalog";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";

import { SignInButton } from "./SignInButton";
import { validateErrorCodeParam } from "./validateErrorCode";

type SignInPageSearchParams = {
  // `searchParams` keys are always normalized to string | string[] |
  // undefined by Next 16. Helpers below pluck the first scalar value.
  next?: string | string[];
  code?: string | string[];
};

function firstScalar(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isAdminPath(path: string): boolean {
  return /^\/admin(?:\/|$)/.test(path);
}

export default async function SignInPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise of the params object.
  searchParams: Promise<SignInPageSearchParams>;
}) {
  const params = await searchParams;
  const validatedNext = validateNextParam(firstScalar(params.next));

  // ── Redirect-loop guard ──────────────────────────────────────────
  // If the user already has a valid Supabase Auth session, skip the
  // CTA entirely and bounce to the validated `next` destination. This
  // prevents the "already signed in user re-clicks sign-in link and
  // re-initiates OAuth" UX, which would also write fresh PKCE
  // verifier cookies on every visit.
  //
  // We use `getUser()` (NOT `getSession()`) because getUser() validates
  // the JWT against the Supabase Auth server, while getSession() trusts
  // whatever's in the cookie. The supabase-ssr docs are explicit that
  // server-side trust decisions must use getUser(). For the
  // "is the user authenticated?" question this matters: a stale cookie
  // would otherwise trigger an unnecessary redirect.
  // R19 F4 (round-19 §B MEDIUM): pre-fix the constructor +
  // supabase.auth.getUser() were both unwrapped — a thrown infra fault
  // (network, missing env, JWT decode error) bypassed the
  // "fall through to render the CTA" path AND the cataloged error
  // block, escaping into Next's generic error surface. Wrap both.
  // Treat any throw as infra: render the sign-in page with the
  // ADMIN_SESSION_LOOKUP_FAILED block via forcedErrorCode below.
  // Returned MISSING-SESSION errors retain the existing
  // graceful-degradation behavior (fall through to render CTA) since
  // those represent transient unauthenticated states; returned
  // NON-missing errors are forced to the cataloged block below
  // (root-landing spec §4.1.5).
  type GetUserResult = Awaited<
    ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>["auth"]["getUser"]>
  >;
  let getUserResult: GetUserResult | undefined;
  let infraThrew = false;
  try {
    const supabase = await createSupabaseServerClient();
    getUserResult = await supabase.auth.getUser();
  } catch {
    infraThrew = true;
  }
  // R17 #3: when isAdminSession returns infra_error during the
  // already-authenticated guard, force the catalog code so the
  // rendered page shows the failure block instead of redirecting.
  let forcedErrorCode: string | null = null;
  if (infraThrew) {
    forcedErrorCode = "ADMIN_SESSION_LOOKUP_FAILED";
  }
  const data = getUserResult?.data;
  const error = getUserResult?.error;
  // Spec §4.1.5 (root-landing R3): a RETURNED non-missing getUser error is
  // auth infrastructure failing, not "no session" — surface the same
  // cataloged block the thrown path gets (isAdminSession discipline,
  // lib/auth/isAdminSession.ts:30-35). Missing-session returned errors
  // keep the existing fall-through-to-CTA behavior.
  if (!infraThrew && error && !isAuthSessionMissingError(error)) {
    forcedErrorCode = "ADMIN_SESSION_LOOKUP_FAILED";
  }
  if (!infraThrew && !error && data?.user) {
    let redirectPath: string | null = validatedNext;
    if (isAdminPath(redirectPath)) {
      const admin = await isAdminSession(new Request("https://crew.fxav.show"));
      if (admin.ok) {
        // Confirmed admin — keep the validated /admin path.
      } else if (admin.reason === "infra_error") {
        // R17 #3 (round-16 §A+§B MEDIUM): under transient is_admin
        // outage the guard previously sent admins to /me silently.
        // Render the sign-in page with ADMIN_SESSION_LOOKUP_FAILED
        // forced into the error block so ErrorExplainer surfaces the
        // cataloged failure copy. User sees a real failure state with
        // manual-retry guidance (the SignInButton on this page)
        // instead of an opaque crew-page downgrade.
        redirectPath = null;
        forcedErrorCode = "ADMIN_SESSION_LOOKUP_FAILED";
      } else {
        // Confirmed not-admin — fall back to /me.
        redirectPath = "/me";
      }
    }
    if (redirectPath !== null) {
      redirect(redirectPath);
    }
  }

  // ── Error code allowlist ─────────────────────────────────────────
  // searchParams.code arrives untrusted (URL-controlled). The helper
  // applies a regex + allowlist; null means "render nothing." The
  // ErrorExplainer is also defensive (unknown code → null) but we
  // gate at this layer too so an attacker who bypasses the regex
  // somehow still can't render an arbitrary catalog entry.
  const errorCode: MessageCode | null =
    forcedErrorCode !== null
      ? (forcedErrorCode as MessageCode)
      : validateErrorCodeParam(firstScalar(params.code));

  return (
    <main
      data-testid="sign-in-page"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-bg px-4 py-section-gap text-text sm:px-8"
    >
      {/*
        M9 C8 / M5-D6 #5: aria-labelledby ties the <header> landmark
        to the <h1> id so AT users navigating by landmark hear the
        sign-in headline as the region's accessible name (rather
        than the generic "banner" landmark label).
      */}
      <header aria-labelledby="sign-in-headline" className="mb-section-gap text-center">
        {/*
          M9 C5 / M5-D4 (R1 fixes): FXAV wordmark above the headline.
          Asset sourced from fxav.net (white-letter variant from the
          Wix CDN); cached locally under public/brand/fxav-wordmark.png.
          - HIGH-1 fix: alt="FX Audio Visual" + NO aria-hidden — the
            wordmark IS the page's primary brand identity for AT users
            (the headline only names the action, not the brand).
          - HIGH-2 fix: `w-24 h-auto` preserves the 1554×1661 aspect
            ratio instead of squashing into a 96×96 square (the prior
            `size-24` class set width AND height = 96px).
          - MED-1 fix: PNG resampled to 192×205 (2× retina) for the
            ~96px display target. Original 1554×1661 file was 176KB;
            resampled is much smaller. Source PNG is preserved in
            git history.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fxav-wordmark.png"
          alt="FX Audio Visual"
          data-testid="sign-in-fxav-wordmark"
          width={96}
          height={102}
          className="mx-auto mb-6 h-auto w-24 select-none"
        />
        <h1
          id="sign-in-headline"
          data-testid="sign-in-headline"
          className="text-3xl font-bold text-text-strong"
        >
          Sign in with Google
        </h1>
        <p className="mt-3 text-base text-text-subtle">
          Use the Google account on your show&rsquo;s crew sheet to continue.
        </p>
      </header>

      <div className="flex flex-col items-center">
        <SignInButton validatedNext={validatedNext} />
      </div>

      {errorCode !== null ? (
        <section
          data-testid="sign-in-error-block"
          // Visual chrome MATCHES the AlertBanner: same warning-bg /
          // warning-text token pair, same border-strong + rounded-md
          // chip, same tile-pad. Keeps the admin/error visual language
          // consistent across crew + admin surfaces.
          //
          // M9 C3 R8 (codex finding): error block is placed
          // IMMEDIATELY after SignInButton — before the sign-in-
          // secondary-path — so an OAuth failure's explanation +
          // recovery copy sits next to the action that failed, not
          // pushed below an escape hatch the user didn't trigger.
          // This deviates from shape brief §5.3 line 142 ("View show
          // list link sits between the Google button and the inline-
          // error region") in favor of Codex's UX argument that the
          // actionable failure should rank ahead of the no-op-ish
          // /me escape on small screens. Brief amendment captured in
          // commit message; brief itself NOT updated since the
          // deviation is small and one-directional (error always
          // ranks higher than escape hatch).
          className="mt-section-gap rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
          role="alert"
        >
          <ErrorExplainer code={errorCode} surface="crew" helpfulContext />
        </section>
      ) : null}

      {/*
        M9 C3 / M5-D5: secondary path for already-signed-in crew who
        landed on the sign-in page accidentally. Per shape brief
        2026-05-14-auth-flow-polish.md §5.3 the OR divider is a
        hairline rule + the literal "OR" centered on it.
      */}
      <div data-testid="sign-in-secondary-path" className="mt-6 flex flex-col items-center gap-3">
        <div className="relative w-full" aria-hidden="true">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-bg px-2 text-xs uppercase tracking-eyebrow text-text-faint">
              OR
            </span>
          </div>
        </div>
        <Link
          data-testid="sign-in-view-show-list"
          href="/me"
          className="inline-flex min-h-tap-min items-center text-sm text-text-subtle underline-offset-2 hover:text-text"
        >
          View show list
        </Link>
      </div>

      {/*
        M9 C3 / M5-D5: help disclosure at page bottom per brief §5.3.
        Sits AFTER the inline-error region so an active error doesn't
        push it off-screen. Spec-check (§13.1 channel boundary): "your
        project manager" is the correct channel — Doug IS the project
        manager. Does NOT include "report this to the developer"
        (that's the §13.1 inversion the M8 R2 M2 watchpoint flagged).
        No email exposed in v1 per brief §5.3 footgun rationale.
      */}
      <p data-testid="sign-in-help-disclosure" className="mt-section-gap text-center text-xs text-text-subtle">
        <span className="font-medium">Need help signing in?</span>{" "}
        Contact your project manager.
      </p>
    </main>
  );
}
