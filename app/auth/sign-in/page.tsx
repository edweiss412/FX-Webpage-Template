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
import { redirect } from "next/navigation";

import { isAdminSession } from "@/lib/auth/isAdminSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateNextParam } from "@/lib/auth/validateNextParam";
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
  const supabase = await createSupabaseServerClient();
  // On network error, error is non-null and we fall through to render the sign-in CTA
  // (graceful degradation — the user can retry OAuth from the rendered page).
  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) {
    let redirectPath = validatedNext;
    if (isAdminPath(redirectPath)) {
      const admin = await isAdminSession(new Request("https://crew.fxav.show"));
      if (!admin.ok) {
        redirectPath = "/me";
      }
    }
    redirect(redirectPath);
  }

  // ── Error code allowlist ─────────────────────────────────────────
  // searchParams.code arrives untrusted (URL-controlled). The helper
  // applies a regex + allowlist; null means "render nothing." The
  // ErrorExplainer is also defensive (unknown code → null) but we
  // gate at this layer too so an attacker who bypasses the regex
  // somehow still can't render an arbitrary catalog entry.
  const errorCode = validateErrorCodeParam(firstScalar(params.code));

  return (
    <main
      data-testid="sign-in-page"
      className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-bg px-4 py-section-gap text-text sm:px-8"
    >
      <header className="mb-section-gap text-center">
        <h1
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
          className="mt-section-gap rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
          role="alert"
        >
          <ErrorExplainer code={errorCode} surface="crew" helpfulContext />
        </section>
      ) : null}
    </main>
  );
}
