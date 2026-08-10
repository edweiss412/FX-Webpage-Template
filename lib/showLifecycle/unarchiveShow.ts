import {
  callLifecycleRpc,
  defaultRpc,
  type LifecycleRpc,
  type LifecycleResult,
} from "@/lib/showLifecycle/_shared";
import { runManualSyncForShow as defaultRunManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import { writeSyncLog } from "@/lib/sync/syncLog";

export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

// Widened 2026-08-09 to forward a deps object, so the catch-up sync writes a
// sync_log row. The alternative - a default wrapper preserving the two-argument
// call - would hide the sink behind a default, which is the indirection the
// fixed-site pin exists to make visible (plan R9 F5).
type CatchUpSync = (
  driveFileId: string,
  mode?: "manual",
  deps?: { processDeps?: { logSync?: typeof writeSyncLog } },
) => Promise<unknown>;

/**
 * Admin server-action backing for unarchive_show. The RPC self-locks (revival-sanitization chokepoint);
 * AFTER it commits, run the catch-up sync as a SEPARATE self-locked call (§2.3 — NOT nested in a lock).
 * A failed/staged catch-up leaves requires_resync=true, which is correct (Publish stays blocked).
 */
export async function unarchiveShow(
  showId: string,
  driveFileId: string,
  deps?: { rpc?: LifecycleRpc; runManualSyncForShow?: CatchUpSync },
): Promise<LifecycleResult> {
  const rpc = deps?.rpc ?? defaultRpc();
  const catchUp = deps?.runManualSyncForShow ?? (defaultRunManualSyncForShow as CatchUpSync);
  const { result, data } = await callLifecycleRpc(rpc, "unarchive_show", { p_show_id: showId });
  if (!result.ok) return result;
  // R8: unarchive_show returns TRUE iff it actually performed the archived->held transition, FALSE on an
  // idempotent no-op (stale/double Unarchive on an already-Held/Live show). Run the MUTATING catch-up sync
  // ONLY on a real transition — otherwise a stale button click would re-sync (and clear live deferrals on)
  // a show that was never archived in this call.
  if (data === true) {
    // best-effort catch-up; separate self-locked txn
    await catchUp(driveFileId, "manual", { processDeps: { logSync: writeSyncLog } });
  }
  return result;
}
