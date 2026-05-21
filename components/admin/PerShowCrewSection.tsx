/**
 * components/admin/PerShowCrewSection.tsx (M9.5)
 *
 * Per-show admin crew section. Lists each crew member with two
 * affordances per spec §5.2 / §7.2:
 *   - "Issue new link" (or "Issue first link" for fresh rows where
 *     max_issued_version === 1 AND row is in no-live-link state)
 *   - "Revoke all links" (disabled in no-live-link state)
 *
 * State machine (spec §5.2 lines 1085-1097, §7.2 line 1100):
 *   - live link:    current_token_version > revoked_below_version
 *   - no-live-link: current_token_version === revoked_below_version
 *   - fresh "Issue first link" label: max_issued_version === 1
 *     AND row is in no-live-link state
 *
 * Server Component. The two affordances are client islands
 * (IssueLinkButton + RevokeAllLinksButton) which own their submission
 * lifecycles via useActionState.
 *
 * Fail-closed branches (Codex R1 HIGH-1 + R4 MEDIUM fixes):
 *   - crewLookupFailed=true wins over every other branch (warning copy
 *     with role=alert; empty-state and rows do NOT render).
 *   - authMissing rows render with both affordances disabled +
 *     diagnostic copy; data-auth-missing=true on the <li> for
 *     downstream observability.
 *
 * UI branches authMissing FIRST inside the map — sentinel 0/0/0
 * versions would otherwise satisfy the no-live-link predicate +
 * "fresh" predicate-by-omission and produce a misleading affordance.
 */
import { IssueLinkButton } from "@/app/admin/show/[slug]/IssueLinkButton";
import { RevokeAllLinksButton } from "@/app/admin/show/[slug]/RevokeAllLinksButton";
import type { CrewRowForLinkPanel } from "@/lib/data/loadShowCrewWithAuth";

export type { CrewRowForLinkPanel };

export function PerShowCrewSection({
  showId,
  crew,
  crewLookupFailed = false,
}: {
  showId: string;
  crew: CrewRowForLinkPanel[];
  /**
   * True when loadShowCrewWithAuth returned crewLookupFailed=true.
   * Renders a distinct warning branch so a Supabase/RLS outage does
   * NOT collapse into the legitimate "no crew yet" empty state.
   * Defaults to false for callers that haven't migrated to passing
   * the flag yet.
   */
  crewLookupFailed?: boolean;
}) {
  if (crewLookupFailed) {
    return (
      <section data-testid="per-show-crew-section" className="space-y-3">
        <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
        <p
          data-testid="per-show-crew-lookup-failed"
          role="alert"
          className="rounded-md border border-warning-text/40 bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          Crew list temporarily unavailable. Refresh to retry. If this
          persists, check Supabase health or page on-call.
        </p>
      </section>
    );
  }

  if (crew.length === 0) {
    return (
      <section data-testid="per-show-crew-section" className="space-y-3">
        <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
        <p
          data-testid="per-show-crew-empty"
          className="rounded-md border border-border bg-surface p-tile-pad text-sm text-text-subtle"
        >
          No crew members on this show yet.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="per-show-crew-section" className="space-y-3">
      <h2 className="text-lg font-semibold text-text-strong">Crew</h2>
      <ul className="flex flex-col gap-3">
        {crew.map((row) => {
          if (row.authMissing) {
            // Impeccable critique M-4: don't render the affordance pair
            // disabled in the authMissing branch — the diagnostic hint
            // already explains why the row can't be acted on, and two
            // greyed-out accent buttons of identical chrome are noise.
            // The action layer remains the authoritative gate; even a
            // forged submit reaches the data-layer's crew_member_not_
            // found branch and refuses.
            return (
              <li
                key={row.id}
                data-testid="per-show-crew-row"
                data-crew-name={row.name}
                data-auth-missing="true"
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-warning-text/40 bg-warning-bg p-tile-pad"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-text-strong wrap-break-word">
                    {row.name}
                  </p>
                  <p
                    data-testid="per-show-crew-auth-missing-hint"
                    className="mt-1 text-xs text-warning-text"
                  >
                    Auth row missing — cannot rotate or revoke. Investigate via sync logs.
                  </p>
                </div>
              </li>
            );
          }

          const isNoLiveLink =
            row.current_token_version === row.revoked_below_version;
          const isFresh = row.max_issued_version === 1 && isNoLiveLink;

          return (
            <li
              key={row.id}
              data-testid="per-show-crew-row"
              data-crew-name={row.name}
              data-auth-missing="false"
              data-no-live-link={isNoLiveLink ? "true" : "false"}
              className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface p-tile-pad"
            >
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium text-text-strong wrap-break-word">
                  {row.name}
                </p>
                {/* Impeccable critique L-5: no-live-link hint reads
                 * as part of the row's status BEFORE the role label
                 * (which is meta about the crew member, not the
                 * row's auth state). Order: name → live state →
                 * role. */}
                {isNoLiveLink && (
                  <p
                    data-testid="per-show-crew-no-live-link-hint"
                    className="mt-1 text-xs text-text-subtle"
                  >
                    No live link.
                  </p>
                )}
                {row.role !== null && (
                  <p className="mt-1 text-xs text-text-faint">
                    {row.role}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <IssueLinkButton
                  showId={showId}
                  crewName={row.name}
                  isFresh={isFresh}
                />
                <RevokeAllLinksButton
                  showId={showId}
                  crewName={row.name}
                  disabled={isNoLiveLink}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
