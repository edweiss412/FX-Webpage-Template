// lib/observe/query/events.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  PAGE_SIZE,
  escapeIlike,
  type AppEventFilters,
  type AppEventRow,
  type AppEventCursor,
} from "@/lib/admin/telemetryTypes";

export type QueryEventsResult =
  | { kind: "ok"; events: AppEventRow[]; hasMore: boolean; nextCursor: AppEventCursor | null }
  | { kind: "infra_error"; message: string };

// EXACT copy of the SELECT string in lib/admin/loadAppEvents.ts (:11-12).
const SELECT =
  "id, occurred_at, level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context, shows(title, slug)";

type RawRow = {
  id: string;
  occurred_at: string;
  level: AppEventRow["level"];
  source: string;
  message: string;
  code: string | null;
  request_id: string | null;
  show_id: string | null;
  drive_file_id: string | null;
  actor_hash: string | null;
  context: Record<string, unknown>;
  shows:
    | { title: string | null; slug: string | null }
    | { title: string | null; slug: string | null }[]
    | null;
};

function mapRow(r: RawRow): AppEventRow {
  const show = Array.isArray(r.shows) ? r.shows[0] : r.shows;
  return {
    id: r.id,
    occurredAt: r.occurred_at,
    level: r.level,
    source: r.source,
    message: r.message,
    code: r.code,
    requestId: r.request_id,
    showId: r.show_id,
    driveFileId: r.drive_file_id,
    actorHash: r.actor_hash,
    context: r.context ?? {},
    showTitle: show?.title ?? null,
    showSlug: show?.slug ?? null,
  };
}

export async function queryEvents(filters: AppEventFilters): Promise<QueryEventsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    // count:"exact" = truthful bound (satisfies _metaBoundedReads); real page bound is .limit below.
    let query = supabase.from("app_events").select(SELECT, { count: "exact" });
    if (filters.levels?.length) query = query.in("level", filters.levels);
    if (filters.source) query = query.eq("source", filters.source);
    if (filters.code) query = query.eq("code", filters.code);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    if (filters.q) query = query.ilike("message", `%${escapeIlike(filters.q)}%`);
    if (filters.cursor) {
      const { occurredAt: c, id } = filters.cursor;
      query = query.or(`occurred_at.lt.${c},and(occurred_at.eq.${c},id.lt.${id})`);
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (error) return { kind: "infra_error", message: "app_events read failed" };
    const rows = (data ?? []) as RawRow[];
    const hasMore = rows.length > PAGE_SIZE;
    const events = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map(mapRow);
    const last = events[events.length - 1];
    const nextCursor: AppEventCursor | null =
      hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null;
    return { kind: "ok", events, hasMore, nextCursor };
  } catch {
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
