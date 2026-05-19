/**
 * components/admin/PreviewBanner.tsx (M10 §B Task 10.8 / Phase 3 / Cluster I-5)
 *
 * Sticky banner mounted at the top of /admin/show/[slug]/preview/[crewId].
 * Spec §9.3:
 *   - "Sticky top banner: `Previewing as Eric Weiss (A1) — [Exit preview]`."
 *   - "The banner is `position: sticky; top: 0; z-index: 100;` and uses a
 *     distinct color (yellow tint) to make impersonation unmistakable."
 *   - "A 'Report this view' button on the banner."
 *
 * DESIGN.md §9 absolute ban on em dashes: spec sample copy contains a
 * literal em dash; we render the same separation as a non-em-dash
 * vertical bar so the rendered DOM stays compliant. The role chip
 * preserves the visual hierarchy the spec sample shows.
 *
 * Exit affordance: a link back to /admin/show/[slug]. Distinct from
 * /admin/dev or any build-gated route (memory:
 * feedback_build_gated_routes_never_fallback_target).
 *
 * Server Component (no 'use client').
 */
import Link from "next/link";
import { ReportButton } from "@/components/shared/ReportButton";

export type PreviewBannerProps = {
  /** Crew member display name resolved from `crew_members.name`. */
  crewMemberName: string;
  /**
   * Display role from `crew_members.role` (e.g., "A1", "Stage Manager",
   * "Lighting"). This is the human-readable role label, NOT the
   * capability flag array (`role_flags`) — flags drive authorization
   * and tile visibility, role drives the banner identity copy.
   * Optional; the banner renders only the name when null.
   */
  crewMemberRoleLabel?: string | null;
  /** The host show's slug. Used to compose the Exit link target. */
  slug: string;
  /**
   * `shows.id` UUID for the previewed show. Threaded into the embedded
   * ReportButton so a "Report this view" submission carries the right
   * show context (§13 admin report flow).
   */
  showId: string;
  /** Crew member id; included in the ReportButton surfaceId so a stale
   * sessionStorage entry can't leak between preview targets. */
  crewMemberId: string;
};

export function PreviewBanner({
  crewMemberName,
  crewMemberRoleLabel,
  slug,
  showId,
  crewMemberId,
}: PreviewBannerProps) {
  return (
    // `role="status"` (not `role="region"`) avoids planting a duplicate
    // landmark above the page's `<header>` (Header.tsx:46) which is
    // already the canonical banner-landmark for the show.
    <aside
      data-testid="admin-preview-banner"
      data-slug={slug}
      role="status"
      aria-live="polite"
      aria-label="Admin preview banner"
      // Sticky + z-100 per §9.3. Yellow tint via warning-bg / warning-text
      // tokens makes impersonation unmistakable; the banner sits above
      // every tile in the stacking context.
      style={{ position: "sticky", top: 0, zIndex: 100 }}
      className="border-b border-border-strong bg-warning-bg text-warning-text shadow-(--shadow-tile)"
    >
      <div className="mx-auto flex w-full max-w-300 flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
        <p className="flex flex-1 flex-wrap items-center gap-2 text-sm sm:text-base">
          <span
            data-testid="admin-preview-banner-label"
            className="font-semibold uppercase"
            style={{ letterSpacing: "var(--tracking-eyebrow)" }}
          >
            Previewing as
          </span>
          <span
            data-testid="admin-preview-banner-name"
            className="font-semibold text-text-strong"
          >
            {crewMemberName}
          </span>
          {crewMemberRoleLabel ? (
            <span
              data-testid="admin-preview-banner-role"
              className="inline-flex items-center rounded-pill border border-border-strong bg-surface px-2 py-0.5 text-xs font-semibold uppercase text-text-strong"
              style={{ letterSpacing: "var(--tracking-eyebrow)" }}
            >
              {crewMemberRoleLabel}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ReportButton
            surface="admin"
            surfaceId={`admin-preview-${slug}-${crewMemberId}`}
            showId={showId}
            label="Report this view"
            variant="text"
          />
          <Link
            data-testid="admin-preview-banner-exit"
            href={`/admin/show/${encodeURIComponent(slug)}`}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:bg-warning-text/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Exit preview
          </Link>
        </div>
      </div>
    </aside>
  );
}
