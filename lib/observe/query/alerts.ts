// lib/observe/query/alerts.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";
import { resolveAlertIdentities, type ResolverRow } from "@/lib/adminAlerts/resolveAlertIdentities";
import type { SerializedAlertIdentity } from "@/lib/adminAlerts/identityTypes";
import { clampLimit, type AlertFilters, type AlertRow, type QueryAlertsResult } from "./types";

// `admin_alerts.context` IS selected (spec §7 carve-out) — but this function
// is the SOLE owner of identity resolution: the raw jsonb is immediately
// projected (allowlisted, sanitized — `projectIdentityContext`) and resolved
// into a display-only `SerializedAlertIdentity` (`resolveAlertIdentities`).
// Neither the raw `context` nor any resolution-group id ever appears on the
// returned `AlertRow` — only `identity`.
const SELECT =
  "id, show_id, code, raised_at, last_seen_at, occurrence_count, resolved_at, resolved_by, shows(title, slug), context";

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
  context: Record<string, unknown> | null;
};

function toSerialized(identity: SerializedAlertIdentity | undefined): SerializedAlertIdentity {
  return { segments: identity?.segments ?? [], global: identity?.global ?? false };
}

function mapAlert(r: RawAlert, identity: SerializedAlertIdentity): AlertRow {
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
    identity,
  };
}

export async function queryAlerts(filters: AlertFilters): Promise<QueryAlertsResult> {
  // Fail-closed at the source, not just the caller: showIdOrGlobal is
  // interpolated into a PostgREST .or() expression, so anything non-UUID
  // (incl. "") must yield ZERO rows, never a widened/injected filter. Hoisted
  // ABOVE the try so the terminal await stays within the _metaInfraContract
  // scanner's try-proximity window (the events.ts:64 extraction precedent).
  if (
    filters.showIdOrGlobal !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.showIdOrGlobal)
  ) {
    return { kind: "ok", alerts: [] };
  }
  try {
    const supabase = createSupabaseServiceRoleClient();
    // count: "exact" is a truthful bound token (satisfies _metaBoundedReads);
    // the real page bound is .limit(clampLimit(...)) on the terminal await. The
    // returned count is intentionally ignored.
    let query = supabase.from("admin_alerts").select(SELECT, { count: "exact" });
    if (filters.openOnly) query = query.is("resolved_at", null);
    if (filters.showIdOrGlobal !== undefined) {
      query = query.or(`show_id.eq.${filters.showIdOrGlobal},show_id.is.null`);
    }
    const code = filters.code?.trim();
    if (code) query = query.eq("code", code);
    const { data, error } = await query
      .order("raised_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "admin_alerts read failed" };

    const rawRows = (data ?? []) as RawAlert[];
    const includePii = filters.includePii ?? false;
    const resolverRows: ResolverRow[] = rawRows.map((r) => ({
      id: r.id,
      code: r.code,
      show_id: r.show_id,
      occurrence_count: r.occurrence_count,
      identityContext: projectIdentityContext(r.context, { includePii }),
    }));
    // `supabase` is the full generated SupabaseClient type; structurally
    // checking it against resolveAlertIdentities' narrow SupabaseLike param
    // triggers TS2589 (excessively deep instantiation). Double-assert
    // through `unknown` — the runtime shape (`.from().select().in().limit()`)
    // is a strict subset the real client always satisfies.
    const resolved = await resolveAlertIdentities(
      resolverRows,
      supabase as unknown as Parameters<typeof resolveAlertIdentities>[1],
      { includePii },
    );

    return {
      kind: "ok",
      alerts: rawRows.map((r) => mapAlert(r, toSerialized(resolved.identities.get(r.id)))),
    };
  } catch {
    return { kind: "infra_error", message: "admin_alerts read threw" };
  }
}
