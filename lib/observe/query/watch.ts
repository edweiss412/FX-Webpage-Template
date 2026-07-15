// §5.0: the channel's webhook-signing secret column is NEVER selected (live
// shared secret) — the structural pin in tests/observe/queryWatch.test.ts
// scans this file for the column's snake_case literal, so this comment must
// name it only descriptively. No free-text columns (status is
// CHECK-constrained, class B) — no sanitizer needed.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { clampLimit, type QueryWatchResult, type WatchFilters, type WatchRow } from "./types";

const SELECT =
  "id, status, watched_folder_id, resource_id, expires_at, created_at, activated_at, superseded_at, stopped_at";

type RawRow = {
  id: string;
  status: string;
  watched_folder_id: string;
  resource_id: string | null;
  expires_at: string | null;
  created_at: string;
  activated_at: string | null;
  superseded_at: string | null;
  stopped_at: string | null;
};

export async function queryWatchChannels(filters: WatchFilters): Promise<QueryWatchResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("drive_watch_channels")
      .select(SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "drive_watch_channels read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): WatchRow => ({
      id: r.id,
      status: r.status,
      watchedFolderId: r.watched_folder_id,
      resourceId: r.resource_id,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      activatedAt: r.activated_at,
      supersededAt: r.superseded_at,
      stoppedAt: r.stopped_at,
    }));
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "drive_watch_channels read threw" };
  }
}
