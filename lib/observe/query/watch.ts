// §5.0: the channel's webhook-signing secret column is NEVER selected (live
// shared secret) — the structural pin in tests/observe/queryWatch.test.ts
// scans this file for the column's snake_case literal, so this comment must
// name it only descriptively. No free-text columns (status is
// CHECK-constrained, class B) — no sanitizer needed.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import {
  clampLimit,
  type QueryWatchResult,
  type WatchFilters,
  type WatchRow,
  type WatchStateRow,
} from "./types";

const SELECT =
  "id, status, watched_folder_id, expires_at, created_at, activated_at, superseded_at, stopped_at";

// Reconcile-state companion read (backoff spec §3.6 D10): retry bookkeeping
// per watched folder. last_error_message is redacted at write time AND passes
// the same sanitizer treatment queryIngestFailures applies (class-13 pin).
const STATE_SELECT =
  "watched_folder_id, consecutive_failures, next_attempt_at, last_attempt_at, last_attempt_outcome, last_error_class, last_error_message";

type RawStateRow = {
  watched_folder_id: string;
  consecutive_failures: number;
  next_attempt_at: string | null;
  last_attempt_at: string | null;
  last_attempt_outcome: string | null;
  last_error_class: string | null;
  last_error_message: string | null;
};

type RawRow = {
  id: string;
  status: string;
  watched_folder_id: string;
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
    const rows = ((data ?? []) as unknown as RawRow[]).map(
      (r): WatchRow => ({
        id: r.id,
        status: r.status,
        watchedFolderId: r.watched_folder_id,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        activatedAt: r.activated_at,
        supersededAt: r.superseded_at,
        stoppedAt: r.stopped_at,
      }),
    );
    // Own try/catch so a THROWN state read is attributed to its own table,
    // never reported as a channels failure (whole-diff review). Ordered by
    // updated_at DESC: abandoned-folder rows persist by design, so an
    // alphabetical order could push the currently-failing folder past the cap.
    let stateData: unknown;
    try {
      const stateRes = await supabase
        .from("drive_watch_reconcile_state")
        .select(STATE_SELECT)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (stateRes.error)
        return { kind: "infra_error", message: "drive_watch_reconcile_state read failed" };
      stateData = stateRes.data;
    } catch {
      return { kind: "infra_error", message: "drive_watch_reconcile_state read threw" };
    }
    const stateRows = ((stateData ?? []) as unknown as RawStateRow[]).map(
      (r): WatchStateRow => ({
        watchedFolderId: r.watched_folder_id,
        consecutiveFailures: r.consecutive_failures,
        nextAttemptAt: r.next_attempt_at,
        lastAttemptAt: r.last_attempt_at,
        lastAttemptOutcome: r.last_attempt_outcome,
        lastErrorClass: r.last_error_class,
        lastErrorMessage:
          r.last_error_message === null
            ? null
            : sanitizeIdentityString(r.last_error_message, { includePii: false }),
      }),
    );
    return { kind: "ok", rows, stateRows };
  } catch {
    return { kind: "infra_error", message: "drive_watch_channels read threw" };
  }
}
