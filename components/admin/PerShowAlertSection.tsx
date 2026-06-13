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
import { nowDate } from "@/lib/time/now";
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { UndoAutoPublishButton } from "@/components/admin/UndoAutoPublishButton";
import type { UndoAutoPublishOutcome } from "@/app/admin/show/[slug]/_actions/undoAutoPublish";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { messageFor, type MessageParams } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderEmphasis } from "@/components/messages/renderEmphasis";

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
  /**
   * M12.13 §6.3 — auto-publish undo window state (computed on the page from
   * `unpublish_token_expires_at`). When true, SHOW_FIRST_PUBLISHED rows render
   * the shared undo action after the message. Optional/false-default so existing
   * call sites and tests that don't thread it keep their behavior (no undo
   * action). The bound (slug-bound, useActionState-shaped) undo action is
   * required only when the flag can be true.
   */
  undoWindowOpen?: boolean;
  undoAutoPublishAction?: (
    prevState: UndoAutoPublishOutcome | null,
    formData: FormData,
  ) => UndoAutoPublishOutcome | Promise<UndoAutoPublishOutcome>;
};

/** §6.3 — the only alert code that carries an in-app undo action. */
const UNDO_ALERT_CODE = "SHOW_FIRST_PUBLISHED";

// §7 fix: interpolate the alert's context so placeholders like `<sheet-name>`
// resolve to the real value instead of leaking literally. Guards not-in-catalog
// codes AND any still-unresolved `<…>` placeholder (missing context key) → null,
// so the caller's Doug-facing fallback shows rather than a leaked token
// (invariant 5). Call-site-only change; lookup.ts's contract is untouched.
function safeDougFacing(code: string, context: Record<string, unknown> | null): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  const doug = messageFor(
    code as MessageCode,
    (context as MessageParams | null) ?? undefined,
  ).dougFacing;
  if (!doug) return null;
  if (UNRESOLVED_PLACEHOLDER_RE.test(doug)) return null;
  return doug;
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
    const { data, error } = await supabase
      .from("admin_alerts")
      .select("id, code, context, raised_at")
      .eq("show_id", showId)
      .is("resolved_at", null)
      .order("raised_at", { ascending: false });
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
  undoWindowOpen = false,
  undoAutoPublishAction,
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
          const copy = safeDougFacing(alert.code, alert.context);
          const isHighlighted = highlightAlertId === alert.id;
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
                {copy ? renderEmphasis(copy) : "Something needs your attention on this show."}
              </p>
              <HelpAffordance
                code={alert.code}
                {...(alert.context ? { params: alert.context as MessageParams } : {})}
              />
              {/* M12.13 §6.3 — SHOW_FIRST_PUBLISHED rows carry the shared in-app
                  undo action while the token window is open. The SAME component +
                  bound server action as the footer button (copy/behavior cannot
                  drift). When the window closes (24h lapse or manual publish →
                  no token), this disappears and the alert remains as history. */}
              {undoWindowOpen && alert.code === UNDO_ALERT_CODE && undoAutoPublishAction ? (
                <UndoAutoPublishButton
                  slug={slug}
                  undoAction={undoAutoPublishAction}
                  testId="undo-auto-publish-alert"
                />
              ) : null}
              <p className="text-xs text-text-subtle tabular-nums">
                Raised{" "}
                <time dateTime={alert.raised_at} suppressHydrationWarning>
                  {formatRelative(alert.raised_at, now)}
                </time>
              </p>
              <PerShowAlertResolveButton alertId={alert.id} slug={slug} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
