import { callLifecycleRpc, defaultRpc, type LifecycleRpc, type LifecycleResult } from "@/lib/showLifecycle/_shared";
import { runManualSyncForShow as defaultRunManualSyncForShow } from "@/lib/sync/runManualSyncForShow";

export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

type CatchUpSync = (driveFileId: string, mode?: "manual") => Promise<unknown>;

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
    await catchUp(driveFileId, "manual"); // best-effort catch-up; separate self-locked txn
  }
  return result;
}
