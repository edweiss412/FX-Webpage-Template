/**
 * app/show/[slug]/[shareToken]/_PickerInterstitial.tsx (M11.5 §B Task C2)
 *
 * The picker. Server Component (no `'use client'`) — the one client
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
 *     data-claimed="true" hook, and a GET form to /auth/sign-in?next=
 *     so a tap routes the user through OAuth recovery instead of
 *     bouncing off PICKER_IDENTITY_CLAIMED at the action layer.
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

import { messageFor } from "@/lib/messages/lookup";
import { selectIdentity } from "@/lib/auth/picker/selectIdentity";
import { StaleCleanupAutoSubmit } from "./_StaleCleanupAutoSubmit";

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
};

async function selectIdentityFormAction(formData: FormData): Promise<void> {
  "use server";
  await selectIdentity(formData);
}

export function PickerInterstitial({
  slug,
  shareToken,
  showId,
  roster,
  banner,
  staleCleanupHint,
}: PickerInterstitialProps) {
  const tokenizedUrl = `/show/${slug}/${shareToken}`;
  const signInRecoveryUrl = `/auth/sign-in?next=${encodeURIComponent(tokenizedUrl)}`;

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
          <p
            data-testid="picker-sub-instruction"
            className="text-sm text-text-subtle"
          >
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
          <ul
            data-testid="picker-roster-list"
            className="flex flex-col gap-2"
          >
            {roster.map((c) => {
              const isClaimed = c.claimed_via_oauth_at !== null;
              const isLead = c.role_flags.includes("LEAD") && !isClaimed;

              const rowClasses = [
                "w-full min-h-tap-min flex items-center justify-between gap-3 rounded-md border border-border px-4",
                "transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
                isClaimed
                  ? "bg-surface-sunken text-text-subtle cursor-pointer hover:bg-surface"
                  : "bg-surface text-text hover:bg-surface-sunken",
              ].join(" ");

              const chipBase =
                "shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold";
              const chipClasses = isLead
                ? `${chipBase} bg-accent text-accent-text`
                : `${chipBase} bg-surface-sunken text-text-subtle`;

              if (isClaimed) {
                return (
                  <li key={c.id}>
                    <form action={signInRecoveryUrl} method="GET">
                      <button
                        type="submit"
                        data-testid="picker-roster-row"
                        data-claimed="true"
                        data-crew-member-id={c.id}
                        className={rowClasses}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
                          <span
                            data-testid="picker-row-lock"
                            aria-label={
                              messageFor("IDENTITY_DEACTIVATED_LOCK_HINT")
                                .crewFacing ?? "Sign in to use this identity"
                            }
                            className="text-text-subtle"
                          >
                            {/* Plain unicode lock — DESIGN.md §8 ratifies
                                lucide-react but the picker row's restraint
                                rules out icon-as-image; a 16px glyph matches
                                the type rhythm here. */}
                            🔒
                          </span>
                          <span className="truncate">{c.name}</span>
                        </span>
                        {c.role && (
                          <span data-testid="picker-role-chip" className={chipClasses}>
                            {c.role}
                          </span>
                        )}
                      </button>
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
                    <button
                      type="submit"
                      data-testid="picker-roster-row"
                      data-claimed="false"
                      data-crew-member-id={c.id}
                      className={rowClasses}
                    >
                      <span className="min-w-0 truncate text-base font-semibold">
                        {c.name}
                      </span>
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

        {staleCleanupHint && (
          <StaleCleanupAutoSubmit
            slug={slug}
            shareToken={shareToken}
            showId={showId}
            expectedEpoch={staleCleanupHint.expectedEpoch}
            expectedCrewMemberId={staleCleanupHint.expectedCrewMemberId}
          />
        )}

        <footer
          data-testid="picker-footer"
          className="mt-4 text-center text-xs text-text-faint"
        >
          Shared by Doug Larson · FXAV
        </footer>
      </div>
    </main>
  );
}
