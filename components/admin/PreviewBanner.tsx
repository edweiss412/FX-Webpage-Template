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

export type PreviewBannerProps = {
  /** Crew member display name resolved from `crew_members.name`. */
  crewMemberName: string;
  /**
   * Optional role label (e.g., "A1", "LEAD", "Crew"). Rendered as a
   * trailing chip after the name. When null the banner shows only the
   * name.
   */
  crewMemberRoleLabel?: string | null;
  /** The host show's slug. Used to compose the Exit link target. */
  slug: string;
};

export function PreviewBanner({
  crewMemberName,
  crewMemberRoleLabel,
  slug,
}: PreviewBannerProps) {
  return (
    <aside
      data-testid="admin-preview-banner"
      data-slug={slug}
      role="region"
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
            className="font-semibold uppercase tabular-nums"
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
              className="inline-flex items-center rounded-pill border border-border-strong bg-surface px-2 py-0.5 text-xs font-semibold uppercase text-text-strong tabular-nums"
              style={{ letterSpacing: "var(--tracking-eyebrow)" }}
            >
              {crewMemberRoleLabel}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            data-testid="admin-preview-banner-report"
            href={`/admin/show/${encodeURIComponent(slug)}?report=preview`}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Report this view
          </Link>
          <Link
            data-testid="admin-preview-banner-exit"
            href={`/admin/show/${encodeURIComponent(slug)}`}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Exit preview
          </Link>
        </div>
      </div>
    </aside>
  );
}
