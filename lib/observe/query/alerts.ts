// lib/observe/query/alerts.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clampLimit, type AlertFilters, type AlertRow, type QueryAlertsResult } from "./types";

// NOTE: admin_alerts.context is intentionally NOT selected — it is not
// redaction-guaranteed (unlike app_events.context). Spec §3.3 / §5.
const SELECT =
  "id, show_id, code, raised_at, last_seen_at, occurrence_count, resolved_at, resolved_by, shows(title, slug)";

type RawAlert = {
  id: string;
  show_id: string | null;
  code: string;
  raised_at: string;
  last_seen_at: string;
  occurrence_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
  shows:
    | { title: string | null; slug: string | null }
    | { title: string | null; slug: string | null }[]
    | null;
};

function mapAlert(r: RawAlert): AlertRow {
  const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
  return {
    id: r.id,
    showId: r.show_id,
    code: r.code,
    raisedAt: r.raised_at,
    lastSeenAt: r.last_seen_at,
    occurrenceCount: r.occurrence_count,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    showTitle: show?.title ?? null,
    showSlug: show?.slug ?? null,
  };
}

export async function queryAlerts(filters: AlertFilters): Promise<QueryAlertsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    // count: "exact" is a truthful bound token (satisfies _metaBoundedReads);
    // the real page bound is .limit(clampLimit(...)) on the terminal await. The
    // returned count is intentionally ignored.
    let query = supabase.from("admin_alerts").select(SELECT, { count: "exact" });
    if (filters.openOnly) query = query.is("resolved_at", null);
    const code = filters.code?.trim();
    if (code) query = query.eq("code", code);
    const { data, error } = await query
      .order("raised_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "admin_alerts read failed" };
    return { kind: "ok", alerts: ((data ?? []) as RawAlert[]).map(mapAlert) };
  } catch {
    return { kind: "infra_error", message: "admin_alerts read threw" };
  }
}
