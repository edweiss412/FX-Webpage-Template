import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import {
  PAGE_SIZE,
  escapeIlike,
  type AppEventFilters,
  type AppEventRow,
  type LoadAppEventsResult,
} from "@/lib/admin/observabilityTypes";

export async function loadAppEvents(filters: AppEventFilters): Promise<LoadAppEventsResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase
      .from("app_events")
      .select(
        "id, occurred_at, level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context, shows(title, slug)",
      )
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });

    if (filters.levels?.length) query = query.in("level", filters.levels);
    if (filters.source) query = query.eq("source", filters.source);
    if (filters.code) query = query.eq("code", filters.code);
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.requestId) query = query.eq("request_id", filters.requestId);
    // Empty filters default to last 24h (spec §5.1): undefined → 24h; null → all (no bound).
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    if (filters.q) query = query.ilike("message", `%${escapeIlike(filters.q)}%`);
    if (filters.cursor) {
      const { occurredAt, id } = filters.cursor;
      query = query.or(`occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${id})`);
    }

    const { data, error } = await query.limit(PAGE_SIZE + 1);
    if (error) {
      void log.error("app_events read returned error", { source: "admin.loadAppEvents", error });
      return { kind: "infra_error", message: "app_events read failed" };
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const hasMore = rows.length > PAGE_SIZE;
    const kept = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const events: AppEventRow[] = kept.map((r) => ({
      id: r.id as string,
      occurredAt: r.occurred_at as string,
      level: r.level as AppEventRow["level"],
      source: r.source as string,
      message: r.message as string,
      code: (r.code as string | null) ?? null,
      requestId: (r.request_id as string | null) ?? null,
      showId: (r.show_id as string | null) ?? null,
      driveFileId: (r.drive_file_id as string | null) ?? null,
      actorHash: (r.actor_hash as string | null) ?? null,
      context: (r.context as Record<string, unknown>) ?? {},
      showTitle: (r.shows as { title?: string } | null)?.title ?? null,
      // link by SLUG — the admin show route is /admin/show/[slug] (.eq("slug", slug)), NOT by UUID.
      showSlug: (r.shows as { slug?: string } | null)?.slug ?? null,
    }));
    const last = events[events.length - 1];
    return {
      kind: "ok",
      events,
      hasMore,
      nextCursor: hasMore && last ? { occurredAt: last.occurredAt, id: last.id } : null,
    };
  } catch (err) {
    void log.error("app_events read threw", { source: "admin.loadAppEvents", error: err });
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
