import { defaultRpc, mapRpcResult, type LifecycleRpc, type LifecycleResult } from "@/lib/showLifecycle/_shared";

export type { LifecycleResult } from "@/lib/showLifecycle/_shared";

/** Admin server-action backing for archive_show. The RPC self-locks; do NOT wrap in withShowLock. */
export async function archiveShow(
  showId: string,
  deps?: { rpc?: LifecycleRpc },
): Promise<LifecycleResult> {
  const rpc = deps?.rpc ?? defaultRpc();
  const { error } = await rpc("archive_show", { p_show_id: showId });
  return mapRpcResult(error);
}
