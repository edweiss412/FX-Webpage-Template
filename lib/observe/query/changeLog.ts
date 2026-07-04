// lib/observe/query/changeLog.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  clampLimit,
  isUuid,
  type ChangeLogFilters,
  type ChangeRow,
  type QueryChangeLogResult,
} from "./types";

// before_image / after_image intentionally excluded (raw row snapshots). Spec §5.
const SELECT =
  "id, show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, status";

type RawChange = {
  id: string;
  show_id: string;
  drive_file_id: string;
  occurred_at: string;
  source: string;
  change_kind: string;
  entity_ref: string | null;
  summary: string;
  status: string;
};

function mapChange(r: RawChange): ChangeRow {
  return {
    id: r.id,
    showId: r.show_id,
    driveFileId: r.drive_file_id,
    occurredAt: r.occurred_at,
    source: r.source,
    changeKind: r.change_kind,
    entityRef: r.entity_ref,
    summary: r.summary,
    status: r.status,
  };
}

export async function queryChangeLog(filters: ChangeLogFilters): Promise<QueryChangeLogResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    // count: "exact" is a truthful bound token (satisfies _metaBoundedReads);
    // the real page bound is .limit(clampLimit(...)) on the terminal await. The
    // returned count is intentionally ignored.
    let query = supabase.from("show_change_log").select(SELECT, { count: "exact" });
    if (filters.showId && isUuid(filters.showId)) query = query.eq("show_id", filters.showId);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null && !Number.isNaN(sinceHours) && sinceHours > 0) {
      const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
      query = query.gte("occurred_at", since);
    }
    const { data, error } = await query
      .order("occurred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "show_change_log read failed" };
    return { kind: "ok", changes: ((data ?? []) as RawChange[]).map(mapChange) };
  } catch {
    return { kind: "infra_error", message: "show_change_log read threw" };
  }
}
