/**
 * app/show/[slug]/[shareToken]/_PickerInterstitial.tsx (M11.5 §B Task C2)
 *
 * The picker. Server Component (no `'use client'`) — its client
 * boundary in the tree is `<StaleCleanupAutoSubmit>` (Task C3, spec §4.7
 * R25), which we mount when the resolver hands us a `staleCleanupHint`.
 *
 * Render contract per spec §7 (R41):
 *   - Top brand strip + "Who are you?" question + sub-instruction.
 *   - Optional banner row above the roster carrying cataloged crewFacing
 *     copy when the resolver flagged the cookie as stale/invalid.
 *   - Roster rows are submit buttons. ACTIVE rows POST through
 *     `selectIdentity`; CLAIMED rows (claimed_via_oauth_at IS NOT NULL,
 *     P-R35 deactivated-row contract) render a lock icon, the
 *     data-claimed="true" hook, and a GET form to /auth/sign-in that
 *     carries `next` in a HIDDEN INPUT, so a tap routes the user through
 *     OAuth recovery instead of bouncing off PICKER_IDENTITY_CLAIMED at
 *     the action layer. The hidden input is not incidental: a GET submit
 *     rebuilds the query string from the form's own fields and discards
 *     whatever the action URL carried, so describing this as an
 *     "/auth/sign-in?next=" action is the exact ambiguity that lost the
 *     return target and sent crew to /admin (validateNextParam's fallback).
 *   - When roster is empty, render the PICKER_EMPTY_ROSTER cataloged
 *     copy. The page route always passes a roster (possibly empty);
 *     fail-closed render is the responsibility of the resolver / route.
 *   - Footer credits Doug as the link issuer.
 *
 * Why a thin Server Action wrapper for selectIdentity:
 *   React 19's `<form action>` expects `(FormData) => void | Promise<void>`.
 *   selectIdentity returns Promise<SelectIdentityResult>. The repo
 *   convention in client components is useActionState; in Server
 *   Components we wrap with an inline `"use server"` async function
 *   so Next emits the wrapper as a Server Action, the form submits
 *   directly, and the typed return is discarded at the boundary
 *   (failure modes are surfaced by the action itself —
 *   PICKER_IDENTITY_CLAIMED throws NEXT_REDIRECT per Pin-2 contract).
 */

import { redirect } from "next/navigation";

import { messageFor } from "@/lib/messages/lookup";
import { selectIdentity } from "@/lib/auth/picker/selectIdentity";
import { isSameOriginServerAction, rejectCrossOriginVoid } from "@/lib/auth/sameOriginServerAction";
import { isValidShowPathPair } from "@/lib/auth/picker/validateClearIdentityInput";
import { ClaimedRowButton } from "./_ClaimedRowButton";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";
import { StaleCleanupAutoSubmit } from "./_StaleCleanupAutoSubmit";
import { cn } from "@/lib/ui/cn";

export type PickerInterstitialRoster = ReadonlyArray<{
  id: string;
  name: string;
  role: string;
  role_flags: string[];
  claimed_via_oauth_at: string | null;
}>;

export type PickerInterstitialBannerCode =
  | "PICKER_EPOCH_STALE_BANNER"
  | "PICKER_REMOVED_FROM_ROSTER_BANNER"
  | "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER";

export type PickerInterstitialProps = {
  slug: string;
  shareToken: string;
  showId: string;
  roster: PickerInterstitialRoster;
  banner: PickerInterstitialBannerCode | null;
  staleCleanupHint: {
    expectedEpoch: number;
    expectedCrewMemberId: string;
  } | null;
  /**
   * Task 12 (R4-HIGH-1): the active-section deep-link. Threaded into the
   * select-identity form (hidden input → selectIdentity's claimed-row
   * sign-in recovery) AND the claimed-row GET recovery URL, so a tap on a
   * claimed row routes through OAuth recovery WITHOUT dropping the section.
   * Already allow-list-validated by page.tsx; buildShowReturnUrl re-checks.
   */
  s?: string | undefined;
};

async function selectIdentityFormAction(formData: FormData): Promise<void> {
  "use server";
  // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker selectIdentity,
  // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
  //
  // GATED, not exempted (origin-sweep spec Resolved scope #9r). The delegate
  // returns a TYPED refusal rather than throwing, so this wrapper would keep
  // executing after a rejected cross-site request — a first-statement
  // delegation claim covers nothing about what follows it.
  if (!(await isSameOriginServerAction())) return rejectCrossOriginVoid("selectIdentityFormAction");
  const result = await selectIdentity(formData);
  if (!result.ok) return;

  // Redirect on success, rather than relying on selectIdentity's
  // `revalidatePath` alone.
  //
  // This form is submitted from `?gate=skip` — that is where the guest flow
  // lands, and where the picker is reachable at all. `revalidatePath` takes a
  // PATH and ignores the query string, so the `?gate=skip` entry was re-served
  // and the action's own re-render came back as the picker again: the person
  // tapped their name and stayed exactly where they were, until they happened
  // to reload.
  //
  // Invisible in development, and only with more than one name on the roster —
  // a single-member roster resolves for its own reasons and hides it. So it
  // reproduces ONLY under `pnpm build && pnpm start`, which is what CI runs and
  // `pnpm dev` is not (playwright.config.ts). Measured: crew-shell 0 / picker 1
  // immediately after the tap, then crew-shell 1 after a reload.
  //
  // Redirecting to the canonical URL also drops `gate=skip`, which has no
  // meaning once a selection exists — it asks to skip a gate the person has
  // just passed.
  const slug = formData.get("slug");
  const shareToken = formData.get("shareToken");
  const s = formData.get("s");
  if (typeof slug !== "string" || typeof shareToken !== "string") return;
  // buildShowReturnUrl interpolates both segments unencoded. selectIdentity
  // validated them already or it would not have returned ok; re-checking here
  // keeps that guarantee local to the redirect that depends on it.
  if (!isValidShowPathPair({ slug, shareToken })) return;
  redirect(buildShowReturnUrl(slug, shareToken, { s: typeof s === "string" ? s : undefined }));
}

export function PickerInterstitial({
  slug,
  shareToken,
  showId,
  roster,
  banner,
  staleCleanupHint,
  s,
}: PickerInterstitialProps) {
  return (
    <main
      data-testid="picker-interstitial-root"
      className="flex min-h-screen flex-col items-center bg-bg px-4 pt-section-gap text-text md:justify-center md:pt-0"
    >
      <div className="flex w-full max-w-90 flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <span
            data-testid="picker-brand-strip"
            className="text-xs font-bold uppercase tracking-eyebrow-strong text-accent-on-bg"
          >
            FXAV
          </span>
          <h1
            data-testid="picker-question-heading"
            className="text-2xl font-bold tracking-tight text-text-strong"
          >
            Who are you?
          </h1>
          <p data-testid="picker-sub-instruction" className="text-sm text-text-subtle">
            Tap your name to open the show page.
          </p>
        </header>

        {banner !== null && (
          <div
            data-testid="picker-banner"
            role="status"
            className="rounded-md bg-stale-tint px-3 py-2.5 text-sm text-text"
          >
            {messageFor(banner).crewFacing}
          </div>
        )}

        {roster.length === 0 ? (
          <div
            data-testid="picker-roster-empty"
            className="py-12 text-center text-sm text-text-subtle"
          >
            {messageFor("PICKER_EMPTY_ROSTER").crewFacing}
          </div>
        ) : (
          <ul data-testid="picker-roster-list" className="flex flex-col gap-2">
            {roster.map((c) => {
              const isClaimed = c.claimed_via_oauth_at !== null;
              const isLead = c.role_flags.includes("LEAD") && !isClaimed;

              const rowClasses = cn(
                "w-full min-h-tap-min flex items-center justify-between gap-3 rounded-md border border-border px-4",
                "transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                isClaimed
                  ? "bg-surface-sunken text-text-subtle cursor-pointer hover:bg-surface"
                  : "bg-surface text-text hover:bg-surface-sunken",
              );

              const chipBase = cn("shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold");
              const chipClasses = isLead
                ? `${chipBase} bg-accent text-accent-text`
                : `${chipBase} bg-surface-sunken text-text-subtle`;

              if (isClaimed) {
                return (
                  <li key={c.id}>
                    {/* `next` rides a hidden input, NOT the action query: a GET
                        submit rebuilds the query string from the form's own
                        fields and discards whatever the action URL carried, so
                        the return target was being dropped and sign-in landed on
                        a bare /auth/sign-in. Raw value — the browser
                        percent-encodes it on submit. Same shape as
                        app/auth/sign-in/SignInButton.tsx. */}
                    <form action="/auth/sign-in" method="GET">
                      <input
                        type="hidden"
                        name="next"
                        value={buildShowReturnUrl(slug, shareToken, { s })}
                      />
                      {/* The button is a client island so it can show a pending
                          state for the three-hop OAuth journey; the form and the
                          hidden `next` stay server-side. See _ClaimedRowButton
                          for why this is local state and not useFormStatus. */}
                      <ClaimedRowButton
                        name={c.name}
                        role={c.role}
                        crewMemberId={c.id}
                        lockHint={
                          messageFor("IDENTITY_DEACTIVATED_LOCK_HINT").crewFacing ??
                          "Sign in to use this identity"
                        }
                        rowClassName={rowClasses}
                        chipClassName={chipClasses}
                        chipBaseClassName={chipBase}
                      />
                    </form>
                  </li>
                );
              }

              return (
                <li key={c.id}>
                  <form action={selectIdentityFormAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="shareToken" value={shareToken} />
                    <input type="hidden" name="crewMemberId" value={c.id} />
                    {s !== undefined && <input type="hidden" name="s" value={s} />}
                    <button
                      type="submit"
                      data-testid="picker-roster-row"
                      data-claimed="false"
                      data-crew-member-id={c.id}
                      className={rowClasses}
                    >
                      <span className="min-w-0 truncate text-base font-semibold">{c.name}</span>
                      {c.role && (
                        <span data-testid="picker-role-chip" className={chipClasses}>
                          {c.role}
                        </span>
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {/* Flow 8.1 (spec §4.2 / D7): persistent "can't find your name" affordance.
            Rendered UNCONDITIONALLY in BOTH roster modes (empty + non-empty) — a
            sanitized-to-empty roster is itself a "can't find myself" path. Cataloged
            crewFacing copy (invariant 5), no PII, no live admin contact (D5). */}
        <p data-testid="picker-name-not-listed" className="text-center text-xs text-text-subtle">
          {messageFor("PICKER_NAME_NOT_LISTED").crewFacing}
        </p>

        {staleCleanupHint && (
          <StaleCleanupAutoSubmit
            slug={slug}
            shareToken={shareToken}
            showId={showId}
            expectedEpoch={staleCleanupHint.expectedEpoch}
            expectedCrewMemberId={staleCleanupHint.expectedCrewMemberId}
          />
        )}

        <footer data-testid="picker-footer" className="mt-4 text-center text-xs text-text-faint">
          Shared by Doug Larson · FXAV
        </footer>
      </div>
    </main>
  );
}
