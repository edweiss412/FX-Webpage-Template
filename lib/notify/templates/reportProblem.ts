import { escapeHtml } from "./escapeHtml";

/**
 * The "Report a problem" footer every push email carries (BL-PUSH-NOTIFICATIONS,
 * the design memo's principle 6).
 *
 * WHAT THIS IS, stated plainly because the memo asks for more: a NAVIGATIONAL
 * entry point. It lands the operator on the surface that already hosts the
 * show-scoped report controls (`ReportButton` -> `ReportModal` -> `POST
 * /api/report`, rendered by `PreviewBanner`, `DataQualityWarningControls`, and
 * `StagedReviewCard`). It is NOT memo form 1's one-click report form with
 * show/staging/parse context auto-attached — that needs a new surface, and its
 * non-show half is PREREQ-fenced as `BL-HELP-NON-SHOW-REPORT-SURFACE`. The delta
 * is recorded as a documented limit in the archived entry, with its un-archive
 * trigger.
 *
 * No new route, no new form, no `/api/report` contract change.
 */
export const REPORT_LINK_LABEL = "Report a problem";

/**
 * Where the link lands.
 *
 * A shape with ONE show context deep-links to that show's modal via the
 * dashboard's `?show=` param — the landed destination the per-show route itself
 * redirects to (`app/admin/show/[slug]/page.tsx`), and where the existing
 * show-scoped report controls live. A shape WITHOUT one (a digest, a multi-show
 * batch body, a global or ingestion realtime problem) has no single show to
 * scope to, so it lands on the dashboard.
 */
export function reportHref(origin: string, slug?: string | null): string {
  return slug ? `${origin}/admin?show=${slug}` : `${origin}/admin`;
}

/** The footer as an HTML paragraph. Both channels are built from one href. */
export function reportLinkHtml(origin: string, slug?: string | null): string {
  const href = reportHref(origin, slug);
  return `<p><a href="${escapeHtml(href)}">${escapeHtml(REPORT_LINK_LABEL)}</a></p>`;
}

/** The footer as a plaintext line. Same href, labeled so the URL is not bare. */
export function reportLinkText(origin: string, slug?: string | null): string {
  return `${REPORT_LINK_LABEL}: ${reportHref(origin, slug)}`;
}
