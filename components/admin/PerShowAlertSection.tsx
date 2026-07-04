/**
 * components/admin/PerShowAlertSection.tsx (M10 §B Task 10.7 / Phase 2)
 *
 * Per-show admin alerts surface rendered ABOVE the §9.2 ParsePanel
 * sub-sections at /admin/show/[slug]. Reads unresolved per-show
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { resolveAlertAction } from "@/lib/adminAlerts/alertActions";
import { nowDate } from "@/lib/time/now";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { messageFor, type MessageParams } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { formatDataGapBreakdown, GAP_CLASSES, type DataGapsSummary } from "@/lib/parser/dataGaps";

const UNRESOLVED_PLACEHOLDER_RE = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;

function formatRelative(iso: string, now: Date): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  const minutes = Math.floor((now.getTime() - parsed) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type AdminAlertRow = {
  id: string;
  code: string;
  context: Record<string, unknown> | null;
  raised_at: string;
};

type PerShowAlertSectionProps = {
  showId: string;
  slug: string;
  /** Optional ?alert_id query param value — highlights the matching row. */
  highlightAlertId?: string | null;
};

// parse-data-quality-warnings §6.4 — read the additive `data_gaps` digest off a
// SHOW_FIRST_PUBLISHED alert's context (jsonb, untyped on the wire). Returns a
// well-formed DataGapsSummary with total>0, else null (absent / malformed /
// total 0 → no sub-line). Defensive: every field is validated since the context
// is operator-readable jsonb that an older producer may not carry.
function readDataGapsDigest(context: Record<string, unknown> | null): DataGapsSummary | null {
  const raw = context?.data_gaps;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { total?: unknown; classes?: unknown };
  if (typeof candidate.total !== "number" || candidate.total <= 0) return null;
  const classes = candidate.classes;
  if (!classes || typeof classes !== "object") return null;
  const c = classes as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  // Reconstruct ALL gap-class keys from the persisted digest. An OLD 3-key context
  // (pre-#289 scope) defaults its missing keys to 0; the persisted `total` is kept
  // as-is (point-in-time snapshot — never retroactively recounted).
  return {
    total: candidate.total,
    classes: Object.fromEntries(GAP_CLASSES.map((g) => [g.code, num(c[g.code])])) as DataGapsSummary["classes"],
  };
}

// §7 fix: interpolate the alert's context so placeholders like `<sheet-name>`
// resolve to the real value instead of leaking literally. Guards not-in-catalog
// codes AND any still-unresolved `<…>` placeholder (missing context key) → null,
// so the caller's Doug-facing fallback shows rather than a leaked token
// (invariant 5). Call-site-only change; lookup.ts's contract is untouched.
// Returns the RAW catalog template when (a) the code is cataloged, (b) it
// has dougFacing copy, and (c) interpolating the alert's context leaves no
// unresolved <placeholder> token. The caller renders the template via
// renderCatalogEmphasis so param values (sheet names!) are inserted as
// opaque text after emphasis parsing, never parsed as markup (Codex R1).
function safeDougFacingTemplate(
  code: string,
  context: Record<string, unknown> | null,
): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  const params = (context as MessageParams | null) ?? undefined;
  const template = messageFor(code as MessageCode).dougFacing;
  if (!template) return null;
  const interpolated = messageFor(code as MessageCode, params).dougFacing;
  if (!interpolated || UNRESOLVED_PLACEHOLDER_RE.test(interpolated)) return null;
  return template;
}

// Exported for tests/admin/_metaInfraContract.test.ts — registry row
// for the §B Supabase call-boundary contract (AGENTS.md §1.9).
export async function fetchPerShowAlerts(
  showId: string,
): Promise<AdminAlertRow[] | { kind: "infra_error"; message: string }> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `supabase client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    // alert-audience-split §5: exclude `audience: "health"` codes from the
    // per-show Doug surface (they flow to the app-health indicator instead).
    // HEALTH ONLY — do NOT exclude info-severity here (unlike the banner/bell),
    // so SHOW_FIRST_PUBLISHED keeps its existing per-show affordance. Unknown
    // codes stay visible (exclusion, not allowlist). The `.not(...in...)` value
    // list must be non-empty, so guard it.
    let query = supabase
      .from("admin_alerts")
      .select("id, code, context, raised_at")
      .eq("show_id", showId)
      .is("resolved_at", null);
    if (HEALTH_CODES.length > 0) {
      query = query.not("code", "in", `(${HEALTH_CODES.map((c) => `"${c}"`).join(",")})`);
    }
    const { data, error } = await query.order("raised_at", { ascending: false });
    if (error) {
      return {
        kind: "infra_error",
        message: `admin_alerts query failed: ${error.message}`,
      };
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      code: row.code as string,
      context: (row.context as Record<string, unknown> | null) ?? null,
      raised_at: row.raised_at as string,
    }));
  } catch (err) {
    return {
      kind: "infra_error",
      message: `admin_alerts query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
          const copyTemplate = safeDougFacingTemplate(alert.code, alert.context);
          // Plain-language explanation, rendered ALWAYS-VISIBLE below the alert
          // title (no "What does this mean?" disclosure toggle, no "Learn more →"
          // link — the former per-row <HelpAffordance>). Unknown/log-only codes
          // carry null helpfulContext → the block simply drops.
          const helpfulContext =
            alert.code in MESSAGE_CATALOG
              ? messageFor(
                  alert.code as MessageCode,
                  (alert.context as MessageParams | null) ?? undefined,
                ).helpfulContext
              : null;
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
          return (
            <li
              key={alert.id}
              data-testid={`per-show-alert-${alert.id}`}
              aria-current={isHighlighted ? "true" : undefined}
              className={`flex flex-col gap-2 rounded-sm border border-border bg-surface p-3 text-text ${
                isHighlighted ? "ring-2 ring-focus-ring ring-offset-2" : ""
              }`}
            >
              <p className="text-sm font-semibold text-text-strong">
                {copyTemplate
                  ? renderCatalogEmphasis(
                      copyTemplate,
                      (alert.context as MessageParams | null) ?? undefined,
                    )
                  : "Something needs your attention on this show."}
              </p>
              {helpfulContext ? (
                <div
                  data-testid={`per-show-alert-help-${alert.id}`}
                  className="mt-1 flex flex-col gap-1 text-sm text-text-subtle"
                >
                  <p className="font-medium">What does this mean?</p>
                  <p className="max-w-prose">{helpfulContext}</p>
                </div>
              ) : null}
              {/* Per-code action link (spec 2026-07-04-alert-action-links §7.1). Fail-quiet:
                  resolveAlertAction returns null for unregistered codes or failed guards. */}
              {action ? (
                <a
                  href={action.href}
                  data-testid={`per-show-alert-action-${alert.id}`}
                  {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  {action.label}
                  {action.external ? <span aria-hidden="true"> ↗</span> : null}
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
              <p className="text-xs text-text-subtle tabular-nums">
                Raised{" "}
                <time dateTime={alert.raised_at} suppressHydrationWarning>
                  {formatRelative(alert.raised_at, now)}
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
