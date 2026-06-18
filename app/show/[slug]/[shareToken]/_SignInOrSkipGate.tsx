/**
 * app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx (M11.5 §B Task C5)
 *
 * Pure Server Component. Rendered by the page route when
 * `resolveShowPageAccess` returns `{ kind: 'no_auth', showId, reason }`
 * AND the URL does NOT carry `?gate=skip`. Two modes per spec §7.1a +
 * P-R27/P-R28/P-R29:
 *
 *   Mode A — `reason: 'first_contact'`
 *     No Google session, no picker cookie entry. Classic welcome:
 *     primary CTA dismisses the gate via `?gate=skip` (re-runs the
 *     auth chain into PickerInterstitial); secondary CTA enters
 *     `/auth/sign-in` for OAuth-first crew.
 *
 *   Mode B — `reason: 'google_mismatch'`
 *     Google session exists but its canonical email matches no crew
 *     row on this show — the shared-device leak vector P-R27 closed.
 *     "Signed in as someone else" header makes the state legible.
 *     Primary CTA goes DIRECTLY to `/api/auth/google/start?next=...`
 *     (NOT `/auth/sign-in`, which would short-circuit on the existing
 *     session — P-R29 Fix-2). Secondary CTA submits a form bound to
 *     `clearIdentityAndSkip` — the atomic action that clears the
 *     stale cookie entry AND redirects to `?gate=skip` in a single
 *     server-side step (P-R29 Fix-3; the page route's `gateSkip`
 *     atomicity guard rejects a hand-crafted `?gate=skip` on a
 *     `google_mismatch` URL, so the action POST is the only legal
 *     path forward).
 */

import { messageFor } from "@/lib/messages/lookup";
import { clearIdentityAndSkip } from "@/lib/auth/picker/clearIdentity";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";

async function clearIdentityAndSkipFormAction(
  formData: FormData,
): Promise<void> {
  "use server";
  await clearIdentityAndSkip(formData);
}

export type SignInOrSkipGateProps = {
  slug: string;
  shareToken: string;
  showId: string;
  reason: "first_contact" | "google_mismatch";
  /**
   * Task 12 (R4-HIGH-1): the active-section deep-link, threaded into the
   * sign-in `?next=` AND the `?gate=skip` CTA so the section survives an
   * OAuth-first or skip path. Already allow-list-validated by page.tsx;
   * buildShowReturnUrl re-validates and drops anything unexpected.
   */
  s?: string | undefined;
};

export function SignInOrSkipGate({
  slug,
  shareToken,
  showId,
  reason,
  s,
}: SignInOrSkipGateProps) {
  // `?next=` carries the section but NOT gate=skip — the OAuth return lands
  // the user resolved, not back on the skip gate.
  const encodedNext = encodeURIComponent(buildShowReturnUrl(slug, shareToken, { s }));
  // The skip CTA carries BOTH the section and gate=skip.
  const skipUrl = buildShowReturnUrl(slug, shareToken, { s, gate: "skip" });

  const isMismatch = reason === "google_mismatch";
  const promptCode = isMismatch
    ? "SIGN_IN_OR_SKIP_PROMPT_MISMATCH"
    : "SIGN_IN_OR_SKIP_PROMPT";

  return (
    <main
      data-testid="sign-in-or-skip-gate"
      className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-section-gap text-center text-text"
    >
      <div className="flex w-full max-w-90 flex-col items-center gap-6">
        <span className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg">
          FXAV
        </span>

        {isMismatch ? (
          <h1
            data-testid="sign-in-or-skip-gate-mismatch-header"
            className="text-2xl font-bold tracking-tight text-text-strong"
          >
            Signed in as someone else
          </h1>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight text-text-strong">
            Welcome
          </h1>
        )}

        <p className="text-sm text-text-subtle">
          {messageFor(promptCode).crewFacing}
        </p>

        <div className="flex w-full flex-col items-stretch gap-3 pt-2">
          {isMismatch ? (
            <>
              <a
                data-testid="sign-in-or-skip-gate-sign-in-cta"
                href={`/api/auth/google/start?next=${encodedNext}`}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Sign in with a different account
              </a>
              <form action={clearIdentityAndSkipFormAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="shareToken" value={shareToken} />
                <input type="hidden" name="showId" value={showId} />
                {s !== undefined && <input type="hidden" name="s" value={s} />}
                <button
                  type="submit"
                  data-testid="sign-in-or-skip-gate-continue-as-guest-cta"
                  className="inline-flex min-h-tap-min w-full items-center justify-center rounded-sm border border-border bg-surface px-4 text-base font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  Continue as guest
                </button>
              </form>
            </>
          ) : (
            <>
              <a
                data-testid="sign-in-or-skip-gate-skip-cta"
                href={skipUrl}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Skip and pick your name
              </a>
              <a
                data-testid="sign-in-or-skip-gate-sign-in-cta"
                href={`/auth/sign-in?next=${encodedNext}`}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 text-base font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Sign in with Google
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
