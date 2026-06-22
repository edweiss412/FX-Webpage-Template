// M12.2 Phase B1 Task 5.3 — fetchDriveConnectionHealth()
//
// Worst-of-active-fleet Drive connection health for the /admin/settings Drive
// panel (spec §3.1). Reads the WORST active show — never the freshest — and
// MUST NOT miss any active show: it issues `head:true` exact COUNT queries with
// WHERE predicates spanning ALL active shows (`archived = false`). It does NOT
// read the capped 500-row render set (`ACTIVE_SHOWS_CAP` in dashboardData is a
// render cap only; a stale show in the overflow must still be caught).
//
// Decision is strict worst-FIRST precedence (first match wins). Status-based
// tiers (hard-failures 4a–c, then sync_unknown 5) PRECEDE the age-based stale
// tiers (6, 7): an unrecognized status on a 7h-old row reads `sync_unknown`,
// NOT `stale_severe`.
//
// Supabase call boundary (invariant 9): client construction AND every read are
// wrapped in try/catch → `{ kind: "infra_error" }`. The recognized status
// IN-set stays in lockstep with `syncStatusBucket` (lib/admin/syncStatus.ts):
// ok | pending | pending_review | drive_error | sheet_unavailable | parse_error.
//
// Registered in tests/admin/_metaInfraContract.test.ts (invariant 9 registry).

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWatchedFolder } from "@/lib/appSettings/getWatchedFolderId";
import { nowDate } from "@/lib/time/now";
import type { MessageCode } from "@/lib/messages/lookup";

export type DriveHealthWarnReason =
  | "not_configured"
  | "watch_inactive"
  | "watch_expired"
  | "sync_drive_error"
  | "sync_sheet_unavailable"
  | "sync_parse_error"
  | "sync_unknown"
  | "stale_severe"
  | "stale_moderate";

export type DriveConnectionHealth =
  | {
      health: "positive";
      folderName: string | null;
      folderId: string | null;
      syncingCount: number;
      lastReadAt: string | null;
    }
  | {
      health: "warn";
      reason: DriveHealthWarnReason;
      code: MessageCode;
      folderName: string | null;
      folderId: string | null;
      syncingCount: number;
      attentionCount: number;
      lastReadAt: string | null;
    }
  | { kind: "infra_error" };

// reason → catalog code (status-specific, NOT collapsed). Exhaustive switch.
function codeForReason(reason: DriveHealthWarnReason): MessageCode {
  switch (reason) {
    case "not_configured":
    case "watch_inactive":
    case "watch_expired":
      return "WATCH_CHANNEL_ORPHANED";
    case "sync_drive_error":
      return "DRIVE_FETCH_FAILED";
    case "sync_sheet_unavailable":
      return "SHEET_UNAVAILABLE";
    case "sync_parse_error":
      return "PARSE_ERROR_LAST_GOOD";
    case "sync_unknown":
      return "SYNC_STATUS_UNKNOWN";
    case "stale_severe":
      return "SYNC_DELAYED_SEVERE";
    case "stale_moderate":
      return "SYNC_DELAYED_MODERATE";
  }
}

// Recognized status set — must stay in lockstep with syncStatusBucket
// (lib/admin/syncStatus.ts:21-40).
const RECOGNIZED_SYNC_STATUSES = [
  "ok",
  "pending",
  "pending_review",
  "drive_error",
  "sheet_unavailable",
  "parse_error",
] as const;

const INFRA_ERROR: DriveConnectionHealth = { kind: "infra_error" };

export async function fetchDriveConnectionHealth(): Promise<DriveConnectionHealth> {
  // 1. Resolve the configured folder. infra_error short-circuits.
  const folder = await getActiveWatchedFolder();
  if ("kind" in folder && folder.kind === "infra_error") return INFRA_ERROR;

  const folderId = "folderId" in folder ? folder.folderId : null;
  const folderName = "folderName" in folder ? folder.folderName : null;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return INFRA_ERROR;
  }

  try {
    const now = await nowDate();
    const nowMs = now.getTime();
    const sixHoursAgo = new Date(nowMs - 6 * 3_600_000).toISOString();
    const oneHourAgo = new Date(nowMs - 1 * 3_600_000).toISOString();

    // 2. syncingCount = exact active-shows count (display + whole-fleet attention).
    const activeCount = await countActive(supabase, (q) => q);
    if (activeCount === null) return INFRA_ERROR;
    const syncingCount = activeCount;

    // 3. lastReadAt (display only) = max last_synced_at over active shows.
    const lastReadAt = await readMaxLastSyncedAt(supabase);
    if (lastReadAt === undefined) return INFRA_ERROR;

    // Short-circuit: no folder configured → Warn/not_configured WITHOUT reading
    // drive_watch_channels (a watch-table fault must not convert this actionable
    // setup state into infra_error). Display values are still computed above.
    if (!folderId) {
      return warn("not_configured", folderName, folderId, syncingCount, syncingCount, lastReadAt);
    }

    // 4. Watch row (ANY status) — latest for the folder.
    let watchRow: {
      status: string | null;
      expires_at: string | null;
      activated_at: string | null;
    } | null;
    try {
      const { data, error } = await supabase
        .from("drive_watch_channels")
        .select("status, expires_at, activated_at")
        .eq("watched_folder_id", folderId)
        .order("activated_at", { ascending: false, nullsFirst: false })
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return INFRA_ERROR;
      watchRow = (data as typeof watchRow) ?? null;
    } catch {
      return INFRA_ERROR;
    }

    // 5. Worst-first precedence (first match wins).

    // tier 1: not_configured — no watch row for the folder.
    if (!watchRow) {
      return warn("not_configured", folderName, folderId, syncingCount, syncingCount, lastReadAt);
    }
    // tier 2: watch_inactive — any non-active status.
    if (watchRow.status !== "active") {
      return warn("watch_inactive", folderName, folderId, syncingCount, syncingCount, lastReadAt);
    }
    // tier 3: watch_expired — active but expires_at <= now.
    if (watchRow.expires_at !== null && Date.parse(watchRow.expires_at) <= nowMs) {
      return warn("watch_expired", folderName, folderId, syncingCount, syncingCount, lastReadAt);
    }

    // tier 4a/4b/4c: hard-failure statuses (red regardless of age).
    const driveErrorCount = await countActive(supabase, (q) =>
      q.eq("last_sync_status", "drive_error"),
    );
    if (driveErrorCount === null) return INFRA_ERROR;
    if (driveErrorCount > 0) {
      return warn(
        "sync_drive_error",
        folderName,
        folderId,
        syncingCount,
        driveErrorCount,
        lastReadAt,
      );
    }
    const sheetUnavailableCount = await countActive(supabase, (q) =>
      q.eq("last_sync_status", "sheet_unavailable"),
    );
    if (sheetUnavailableCount === null) return INFRA_ERROR;
    if (sheetUnavailableCount > 0) {
      return warn(
        "sync_sheet_unavailable",
        folderName,
        folderId,
        syncingCount,
        sheetUnavailableCount,
        lastReadAt,
      );
    }
    const parseErrorCount = await countActive(supabase, (q) =>
      q.eq("last_sync_status", "parse_error"),
    );
    if (parseErrorCount === null) return INFRA_ERROR;
    if (parseErrorCount > 0) {
      return warn(
        "sync_parse_error",
        folderName,
        folderId,
        syncingCount,
        parseErrorCount,
        lastReadAt,
      );
    }

    // tier 5: sync_unknown — unrecognized non-null status OR null-status-fresh-ts.
    // Two head:true counts summed.
    const inList = `(${RECOGNIZED_SYNC_STATUSES.map((s) => `"${s}"`).join(",")})`;
    const unknownStatusCount = await countActive(supabase, (q) =>
      q.not("last_sync_status", "in", inList).not("last_sync_status", "is", null),
    );
    if (unknownStatusCount === null) return INFRA_ERROR;
    const nullStatusFreshCount = await countActive(supabase, (q) =>
      q.is("last_sync_status", null).not("last_synced_at", "is", null),
    );
    if (nullStatusFreshCount === null) return INFRA_ERROR;
    const syncUnknownCount = unknownStatusCount + nullStatusFreshCount;
    if (syncUnknownCount > 0) {
      return warn("sync_unknown", folderName, folderId, syncingCount, syncUnknownCount, lastReadAt);
    }

    // tier 6: stale_severe — null/never-synced OR older than 6h OR pending_review >6h.
    const staleSevereCount = await countActive(supabase, (q) =>
      q.or(
        `last_synced_at.is.null,last_synced_at.lt.${sixHoursAgo},and(last_sync_status.eq.pending_review,last_synced_at.lt.${sixHoursAgo})`,
      ),
    );
    if (staleSevereCount === null) return INFRA_ERROR;
    if (staleSevereCount > 0) {
      return warn("stale_severe", folderName, folderId, syncingCount, staleSevereCount, lastReadAt);
    }

    // tier 7: stale_moderate — between 1h and 6h old.
    const staleModerateCount = await countActive(supabase, (q) =>
      q.lt("last_synced_at", oneHourAgo).gte("last_synced_at", sixHoursAgo),
    );
    if (staleModerateCount === null) return INFRA_ERROR;
    if (staleModerateCount > 0) {
      return warn(
        "stale_moderate",
        folderName,
        folderId,
        syncingCount,
        staleModerateCount,
        lastReadAt,
      );
    }

    // ✓ positive
    return { health: "positive", folderName, folderId, syncingCount, lastReadAt };
  } catch {
    return INFRA_ERROR;
  }
}

function warn(
  reason: DriveHealthWarnReason,
  folderName: string | null,
  folderId: string | null,
  syncingCount: number,
  attentionCount: number,
  lastReadAt: string | null,
): DriveConnectionHealth {
  return {
    health: "warn",
    reason,
    code: codeForReason(reason),
    folderName,
    folderId,
    syncingCount,
    attentionCount,
    lastReadAt,
  };
}

// head:true exact count over active shows (archived=false), with an additional
// predicate builder. Returns null on returned-error (caller → infra_error).
// `void _d` keeps the invariant-9 `{ data, error }` destructuring shape.
type CountQuery = {
  eq: (col: string, val: unknown) => CountQuery;
  lt: (col: string, val: unknown) => CountQuery;
  gte: (col: string, val: unknown) => CountQuery;
  is: (col: string, val: unknown) => CountQuery;
  not: (col: string, op: string, val: unknown) => CountQuery;
  or: (filter: string) => CountQuery;
};

async function countActive(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  refine: (q: CountQuery) => CountQuery,
): Promise<number | null> {
  try {
    const base = supabase
      .from("shows")
      .select("id", { count: "exact", head: true })
      .eq("archived", false) as unknown as CountQuery;
    const query = refine(base);
    const {
      data: _d,
      count,
      error,
    } = await (query as unknown as Promise<{
      data: unknown;
      count: number | null;
      error: unknown;
    }>);
    void _d;
    if (error) return null;
    if (typeof count !== "number") return null;
    return count;
  } catch {
    return null;
  }
}

// max last_synced_at over active shows (display only). Returns undefined on
// returned-error (caller → infra_error); null when never synced.
async function readMaxLastSyncedAt(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string | null | undefined> {
  try {
    const { data, error } = await supabase
      .from("shows")
      .select("last_synced_at")
      .eq("archived", false)
      .order("last_synced_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return undefined;
    const rows = (data as Array<{ last_synced_at: string | null }> | null) ?? [];
    return rows[0]?.last_synced_at ?? null;
  } catch {
    return undefined;
  }
}
