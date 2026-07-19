/**
 * components/admin/PerShowAlertSection.tsx (M10 §B Task 10.7 / Phase 2)
 *
 * Per-show admin alerts surface rendered ABOVE the §9.2 ParsePanel
 * sub-sections in the show review modal (/admin?show=<slug>). Reads unresolved per-show
 * admin_alerts (admin_alerts WHERE show_id = $showId AND resolved_at
 * IS NULL) via the Supabase server client and renders one row per
 * alert. The "Mark resolved" button on each row POSTs to the
 * SHOW-SCOPED resolve route (/api/admin/show/[slug]/alerts/[id]/resolve)
 * — NEVER the global route per the cross-show-forgery hardening in
 * plan §M10 Task 10.6.
 *
 * Server Component shell (fetches data) + thin client island per row
 * for the Resolve button. The optional ?alert_id query param triggers
 * a highlight-on-arrival ring on the matching row (a11y: aria-current
 * pinned to that row).
 */
import { isAutoResolving, autoResolveNote } from "@/lib/adminAlerts/audience";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { nowDate } from "@/lib/time/now";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { formatDataGapBreakdown } from "@/lib/parser/dataGaps";
import {
  catalogHelpHref,
  formatRelativeRaisedAt,
  readDataGapsDigest,
  safeDougFacingTemplate,
} from "@/lib/admin/attentionItems";
import { fetchPerShowAlerts } from "@/lib/adminAlerts/fetchPerShowAlerts";

// Relocated read path (published-show-alerts §3.1a): the fetch lives in
// lib/adminAlerts/fetchPerShowAlerts.ts (its _metaInfraContract registry row
// points there); re-exported so existing callers keep one import site until
// this component retires.
export { fetchPerShowAlerts } from "@/lib/adminAlerts/fetchPerShowAlerts";

type PerShowAlertSectionProps = {
  showId: string;
  slug: string;
  /** Optional ?alert_id query param value — highlights the matching row. */
  highlightAlertId?: string | null;
};


export async function PerShowAlertSection({
  showId,
  slug,
  highlightAlertId,
}: PerShowAlertSectionProps) {
  const result = await fetchPerShowAlerts(showId);

  if (!Array.isArray(result)) {
    return (
      <section
        data-testid="per-show-alert-section-infra-error"
        aria-labelledby="per-show-alert-section-heading"
        className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
      >
        <h2 id="per-show-alert-section-heading" className="text-base font-semibold">
          Could not load alerts
        </h2>
        <p>This is usually temporary. Refresh in a moment.</p>
      </section>
    );
  }

  if (result.length === 0) {
    return null;
  }

  // M11 Phase C (C.2 extension): request-scoped wall-clock instant for
  // relative-time labels, hoisted past the early-return so we only pay
  // for the time read when alerts actually render.
  const now = await nowDate();

  return (
    <section
      data-testid="per-show-alert-section"
      aria-labelledby="per-show-alert-section-heading"
      className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
    >
      <div className="flex items-center gap-2">
        <h2 id="per-show-alert-section-heading" className="text-lg font-semibold">
          Alerts for this show ({result.length})
        </h2>
        <HelpTooltip
          label="Help: Alerts for this show"
          testId="help-affordance--per-show-alerts--tooltip"
        >
          <p>
            Alerts collect anything we noticed about this show that you should know about: parse
            warnings, ambiguous crew rows, sync issues, and the like. Tap What does this mean on any
            alert for a plain-language explanation. Mark resolved once you have looked into it; the
            alert will return if the underlying problem reappears.
          </p>
          <p className="mt-2">
            {/* aria-label drops the decorative "→" from the accessible name
                without splitting the text run (text-run splits shift
                text-decoration paint — byte-level screenshot drift). */}
            <a
              href="/help/admin/parse-warnings"
              aria-label="Learn more about alerts"
              className="font-semibold text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1"
            >
              Learn more →
            </a>
          </p>
        </HelpTooltip>
      </div>
      <ul className="flex flex-col gap-3">
        {result.map((alert) => {
          const copyTemplate = safeDougFacingTemplate(alert.code, alert.messageParams);
          const isHighlighted = highlightAlertId === alert.id;
          // R5-HIGH-1: TILE_PROJECTION_FETCH_FAILED carries the curated set of
          // crew-page data domains whose sub-query failed in context.failedKeys
          // (a fixed server-side vocabulary — hotel, rooms, transportation,
          // contacts, financials — NEVER raw pg error text). Surface it as a
          // small detail line so the operator sees WHICH sources failed without
          // the code's domain-neutral dougFacing having to enumerate them.
          const failedKeys =
            alert.code === "TILE_PROJECTION_FETCH_FAILED" &&
            Array.isArray(alert.context?.failedKeys)
              ? (alert.context.failedKeys as unknown[]).filter(
                  (k): k is string => typeof k === "string",
                )
              : null;
          // parse-data-quality-warnings §6.4 — bespoke data-gaps sub-line for the
          // first-published digest (SHOW_FIRST_PUBLISHED only). Rendered as a
          // sibling detail, NOT interpolated into the catalog dougFacing copy.
          const dataGapsDigest =
            alert.code === "SHOW_FIRST_PUBLISHED" ? readDataGapsDigest(alert.context) : null;
          const action = resolveAlertAction(alert.code, alert.context, { slug });
          const helpHref = catalogHelpHref(alert.code);
          return (
            <li
              key={alert.id}
              data-testid={`per-show-alert-${alert.id}`}
              aria-current={isHighlighted ? "true" : undefined}
              className={`flex flex-col gap-2 rounded-sm border border-border bg-surface p-3 text-text ${
                isHighlighted ? "ring-2 ring-focus-ring ring-offset-2" : ""
              }`}
            >
              <p className="wrap-break-word whitespace-pre-line text-sm font-semibold text-text-strong">
                {copyTemplate
                  ? renderCatalogEmphasis(copyTemplate, alert.messageParams)
                  : "Something needs your attention on this show."}
              </p>
              {/* Per-code action link (spec 2026-07-04-alert-action-links §7.1). Fail-quiet:
                  resolveAlertAction returns null for unregistered codes or failed guards. */}
              {action ? (
                <a
                  href={action.href}
                  data-testid={`per-show-alert-action-${alert.id}`}
                  {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {action.label}
                  {action.external ? <span aria-hidden="true"> ↗</span> : null}
                </a>
              ) : null}
              {/* Learn more (impeccable critique P1): appended after the
                  per-code action link, low-emphasis (subtle/quiet — not the
                  action link's text-text-strong weight) so it never competes
                  with a real action. helpHref null (uncataloged or no catalog
                  helpHref) hides it. */}
              {helpHref ? (
                <a
                  href={helpHref}
                  data-testid={`per-show-alert-help-link-${alert.id}`}
                  className="inline-flex min-h-tap-min items-center self-start text-xs text-text-subtle underline-offset-2 transition-colors duration-fast hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  aria-label={`Learn more about ${
                    (alert.code in MESSAGE_CATALOG &&
                      messageFor(alert.code as MessageCode).title) ||
                    "this alert"
                  }`}
                >
                  Learn more
                </a>
              ) : null}
              {failedKeys && failedKeys.length > 0 ? (
                <p
                  data-testid={`per-show-alert-failed-sources-${alert.id}`}
                  className="text-xs text-text-subtle"
                >
                  Failed sources: {failedKeys.join(", ")}
                </p>
              ) : null}
              {/* parse-data-quality-warnings §6.4 — bespoke data-gaps digest
                  sub-line. Human per-class labels only (invariant 5 — never the
                  raw §12.4 code). Static alert state → present iff total>0;
                  instant, no animation. */}
              {dataGapsDigest ? (
                <p
                  data-testid={`per-show-alert-data-gaps-${alert.id}`}
                  className="text-xs text-text-subtle"
                >
                  Data dropped while parsing: {formatDataGapBreakdown(dataGapsDigest)}
                </p>
              ) : null}
              {/* At-a-glance identity (Task 11, spec §3.1–§3.3): the resolved
                  crew/show/email/count string. Muted sub-line tone mirrors the
                  failedKeys/dataGaps detail lines above (text-xs text-text-subtle,
                  no new token). Suppressed entirely when identityText is null
                  (global / empty / unknown code / degraded resolve), AND ALSO
                  when the code names its entity inline in the resolved message
                  (spec 2026-07-17-condensed-alert-copy-design §5 — INLINE_IDENTITY_CODES,
                  `copyTemplate !== null` is the "message resolved" signal so the
                  chip never drops when the template failed to interpolate). The
                  <p> contains ONLY the identity string. */}
              {alert.identityText &&
              !(INLINE_IDENTITY_CODES.has(alert.code) && copyTemplate !== null) ? (
                <p
                  data-testid="per-show-alert-identity"
                  className="wrap-break-word text-xs text-text-subtle"
                >
                  {alert.identityText}
                </p>
              ) : null}
              <p className="text-xs text-text-subtle tabular-nums">
                Raised{" "}
                <time dateTime={alert.raised_at} suppressHydrationWarning>
                  {formatRelativeRaisedAt(alert.raised_at, now)}
                </time>
              </p>
              {isInboxRouted(alert.code) ? (
                // Inbox-routed sync problems (SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD)
                // are auto-clear-only: the show page shows them read-only (no "Mark
                // resolved") — they clear when the sheet is back / re-parses. The
                // Needs attention inbox is where this to-do surfaces (spec §4.8).
                <p
                  data-testid={`per-show-alert-autoclear-${alert.id}`}
                  className="text-xs text-text-subtle"
                >
                  Clears automatically once the sheet is back or re-parses.
                </p>
              ) : isAutoResolving(alert.code) ? (
                // Any other auto-resolving code (alert-resolve-truthing §4.2): a manual
                // "Mark resolved" would be a misleading no-op, so it is suppressed and a
                // generic auto-clear note takes its place.
                <p
                  data-testid={`per-show-alert-autoclear-${alert.id}`}
                  className="text-xs text-text-subtle"
                >
                  {autoResolveNote(alert.code)}
                </p>
              ) : (
                <PerShowAlertResolveButton alertId={alert.id} slug={slug} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
