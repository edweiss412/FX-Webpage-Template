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
import { PerShowAlertResolveButton } from "@/components/admin/PerShowAlertResolveButton";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

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

function safeDougFacing(code: string): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

async function fetchPerShowAlerts(
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
        <h2
          id="per-show-alert-section-heading"
          className="text-base font-semibold"
        >
          Could not load alerts
        </h2>
        <p>The admin database query failed. Refresh in a moment.</p>
      </section>
    );
  }

  if (result.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="per-show-alert-section"
      aria-labelledby="per-show-alert-section-heading"
      className="flex flex-col gap-3 rounded-md border border-warning-text bg-warning-bg p-tile-pad text-warning-text"
    >
      <h2
        id="per-show-alert-section-heading"
        className="text-lg font-semibold"
      >
        Alerts for this show ({result.length})
      </h2>
      <ul className="flex flex-col gap-3">
        {result.map((alert) => {
          const copy = safeDougFacing(alert.code);
          const isHighlighted = highlightAlertId === alert.id;
          return (
            <li
              key={alert.id}
              data-testid={`per-show-alert-${alert.id}`}
              aria-current={isHighlighted ? "true" : undefined}
              className={`flex flex-col gap-2 rounded-sm border border-warning-text bg-surface p-3 text-text ${
                isHighlighted ? "ring-2 ring-focus-ring ring-offset-2" : ""
              }`}
            >
              <p className="text-sm font-semibold text-text-strong">
                {copy ?? "Something needs your attention on this show."}
              </p>
              <p className="text-xs text-text-subtle tabular-nums">
                Raised{" "}
                <time dateTime={alert.raised_at} suppressHydrationWarning>
                  {alert.raised_at}
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
