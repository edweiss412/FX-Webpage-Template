/**
 * components/admin/DashboardFooter.tsx (M11 Phase G.3)
 *
 * Dashboard footer per spec §5.6 matrix row 4:
 *   - `<a href="/help/tour" data-testid="help-affordance--dashboard-footer--tour">`
 *   - Visible text: "Take the tour →"
 *
 * Phase G.3 supersedes M10's in-product `<Tour />` modal (Tour.tsx deleted).
 * The /help/tour MDX page (Phase E.12) is now the canonical walkthrough;
 * the dashboard footer routes Doug to it directly via this link, in line
 * with the §5.6 template-family pattern of "section affordance → /help
 * deep link."
 *
 * Server Component.
 */
export function DashboardFooter() {
  return (
    <footer
      data-testid="admin-dashboard-footer"
      className="mt-section-gap flex flex-col gap-2 border-t border-border pt-section-gap"
    >
      <p
        className="text-xs font-medium uppercase text-text-subtle"
        style={{ letterSpacing: "var(--tracking-eyebrow)" }}
      >
        New here?
      </p>
      <p className="text-sm text-text-subtle">
        A short walkthrough of how this admin page is laid out.
      </p>
      {/* aria-label drops the decorative "→" from the accessible name without
          splitting the text run (flex containers drop the space between split
          items AND shift text-decoration paint — byte-level screenshot drift
          on dashboard-overview, PR #25 R1/R2). */}
      <a
        href="/help/tour"
        aria-label="Take the tour"
        data-testid="help-affordance--dashboard-footer--tour"
        className="inline-flex w-fit min-h-tap-min items-center justify-center rounded-sm text-sm font-medium text-accent-on-bg underline underline-offset-4 transition-colors duration-fast hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        Take the tour →
      </a>
    </footer>
  );
}
