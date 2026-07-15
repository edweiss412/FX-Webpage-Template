import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { serializeWarningArray } from "./serializeWarning";
import { clampLimit, type QuerySyncLogResult, type SyncLogFilters, type SyncLogRow } from "./types";

const SELECT =
  "id, show_id, drive_file_id, status, message, parse_warnings, duration_ms, occurred_at";

type RawRow = {
  id: string;
  show_id: string | null;
  drive_file_id: string | null;
  status: string;
  message: string | null;
  parse_warnings: unknown;
  duration_ms: number | null;
  occurred_at: string;
};

export async function querySyncLog(filters: SyncLogFilters): Promise<QuerySyncLogResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("sync_log").select(SELECT, { count: "exact" });
    if (filters.showId) query = query.eq("show_id", filters.showId);
    if (filters.driveFileId) query = query.eq("drive_file_id", filters.driveFileId);
    if (filters.status) query = query.eq("status", filters.status);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte("occurred_at", new Date(Date.now() - sinceHours * 3_600_000).toISOString());
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "sync_log read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map(
      (r): SyncLogRow => ({
        id: r.id,
        showId: r.show_id,
        driveFileId: r.drive_file_id,
        // §5.0 class C: sync_log.status is unconstrained text in the DDL — sanitized
        // (lossless for real values like "watermark"; token-proof for garbage).
        status: sanitizeIdentityString(r.status, { includePii }),
        message: sanitizeIdentityString(r.message, { includePii }),
        warningCount: Array.isArray(r.parse_warnings) ? r.parse_warnings.length : 0,
        warnings: serializeWarningArray(r.parse_warnings, { includePii }),
        durationMs: r.duration_ms,
        occurredAt: r.occurred_at,
      }),
    );
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "sync_log read threw" };
  }
}
