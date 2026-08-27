// Doug-surface read of the watch reconnect bookkeeping (backoff spec §3.6).
//
// Registered Supabase call boundary (tests/admin/_metaInfraContract.test.ts):
// returned error, thrown query, and client-construction throw each surface as
// the DISCRIMINABLE `{ kind: "infra_error" }` — never collapsed into the
// benign `null`, which means exactly "no row for this folder" (invariant 9).
// The two consumers (bell feed, Settings page) map `infra_error` to
// "line hidden" at their render boundary, deliberately: a failed bookkeeping
// read must never break the feed or the panel.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export type WatchSurfaceState = {
  nextAttemptAt: string | null;
  consecutiveFailures: number;
  lastAttemptOutcome: "failed" | "succeeded" | null;
};

type StateRow = {
  next_attempt_at: string | null;
  consecutive_failures: number;
  last_attempt_outcome: "failed" | "succeeded" | null;
};

export async function readWatchSurfaceState(
  folderId: string,
): Promise<WatchSurfaceState | null | { kind: "infra_error" }> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("drive_watch_reconcile_state")
      .select("next_attempt_at, consecutive_failures, last_attempt_outcome")
      .eq("watched_folder_id", folderId)
      .maybeSingle();
    if (error) {
      void log.error("drive_watch_reconcile_state read returned error", {
        source: "admin.watchSurfaceState",
        code: "WATCH_SURFACE_STATE_READ_RETURNED_ERROR",
        error,
      });
      return { kind: "infra_error" };
    }
    if (!data) return null;
    const row = data as StateRow;
    return {
      nextAttemptAt: row.next_attempt_at,
      consecutiveFailures: row.consecutive_failures,
      lastAttemptOutcome: row.last_attempt_outcome,
    };
  } catch (err) {
    void log.error("drive_watch_reconcile_state read threw", {
      source: "admin.watchSurfaceState",
      code: "WATCH_SURFACE_STATE_READ_THREW",
      error: err,
    });
    return { kind: "infra_error" };
  }
}
